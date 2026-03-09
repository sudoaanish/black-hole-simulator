#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform float uTime;
uniform float uTimeScale;
uniform vec3 uCameraPos;
uniform vec3 uCameraForward;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uFovY;
uniform float uAspect;
uniform float uSchwarzschildRadius;
uniform int uSteps;
uniform float uStepSize;
uniform int uShowAccretionDisk;
uniform int uShowDoppler;
uniform int uShowRedshift;
uniform int uShowBeaming;
uniform int uShowPhotonSphere;
uniform vec3 uObserverVelocity;
uniform float uStarDensity;

// Numerical guard for divisions and sqrt.
#define EPSILON 1e-5
// Upper loop bound, runtime controlled with uSteps.
#define MAX_RK4_STEPS 256
// Escape distance in multiples of r_s.
#define ESCAPE_RADIUS_FACTOR 90.0
// Disk ranges in multiples of r_s.
#define DISK_INNER_FACTOR 3.0
#define DISK_OUTER_FACTOR 14.0
#define DISK_ARM_OUTER_FACTOR 22.0
// Eq. 25.40 MTW: u'' + u = (3/2) r_s u^2.
#define SCHWARZSCHILD_BENDING_COEFF 1.5
// Disk tilt used for the default view.
#define DISK_TILT 0.29670597284
#define PI 3.141592653589793
#define TWO_PI 6.283185307179586

struct RayState {
  vec3 pos;
  vec3 vel;
};

struct RayDeriv {
  vec3 dPos;
  vec3 dVel;
};

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * valueNoise(p * freq);
    p = rot * p;
    freq *= 2.07;
    amp *= 0.48;
  }
  return v;
}

vec3 getStarColor(vec2 cell, float brightness, bool warmOnly) {
  float typeRoll = hash21(cell + vec2(91.3, 47.2));
  float hueVar = hash21(cell + vec2(13.7, 83.5));
  if (warmOnly) {
    typeRoll *= 0.74;
  }

  vec3 starColor;
  if (typeRoll < 0.75) {
    starColor = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.95, 0.82), hueVar);
  } else if (typeRoll < 0.95) {
    starColor = mix(vec3(1.0, 0.88, 0.65), vec3(1.0, 0.75, 0.45), hueVar);
    brightness *= 0.7;
  } else if (typeRoll < 0.99) {
    starColor = mix(vec3(1.0, 0.35, 0.15), vec3(0.9, 0.15, 0.08), hueVar);
    brightness *= 0.5;
  } else {
    starColor = mix(vec3(0.75, 0.88, 1.0), vec3(0.45, 0.65, 1.0), hueVar);
    brightness *= 1.3;
  }
  return starColor * brightness;
}

float fiberTexture(float r, vec2 posNorm, float timeValue) {
  float omega = pow(max(r * 3.0 + 1.0, 0.5), -1.5);
  float phase = omega * timeValue * 0.4;
  float c = cos(phase);
  float s = sin(phase);
  vec2 rotatedPos = vec2(posNorm.x * c - posNorm.y * s, posNorm.x * s + posNorm.y * c);
  // Seam-free UV domain from rotated normalized position.
  vec2 fiberUV = rotatedPos * vec2(2.5, 1.8);

  vec2 warpOffset = vec2(
    fbm(fiberUV * 0.6 + vec2(1.7, 9.2)),
    fbm(fiberUV * 0.6 + vec2(8.3, 2.8))
  ) * 0.35;

  float fiber = fbm(fiberUV + warpOffset);
  fiber = smoothstep(0.25, 0.75, fiber);
  return fiber;
}

float spiralArm(float r, float angle, vec2 posNorm, float timeValue) {
  if (r < 1.0) {
    return 0.0;
  }

  float omega = pow(max(r * 2.0, 0.5), -1.5);
  float phase = omega * timeValue * 0.3;
  float c = cos(phase);
  float s = sin(phase);
  vec2 rotatedPos = vec2(posNorm.x * c - posNorm.y * s, posNorm.x * s + posNorm.y * c);
  float spiralAngle = angle - r * 1.8 + phase;
  vec2 spiralDir = vec2(cos(spiralAngle), sin(spiralAngle));
  vec2 spiralUV = rotatedPos * vec2(1.0, 2.0) + spiralDir * 0.7 + vec2(0.0, r * 0.6);
  float arm = fbm(spiralUV);
  arm = smoothstep(0.4, 0.7, arm);
  arm *= exp(-max(r - 1.0, 0.0) * 1.5);
  return arm * 0.5;
}

vec3 toDiskSpace(vec3 worldPos) {
  float c = cos(DISK_TILT);
  float s = sin(DISK_TILT);
  return vec3(worldPos.x, c * worldPos.y + s * worldPos.z, -s * worldPos.y + c * worldPos.z);
}

vec3 shadeDisk(vec3 hitPos, float timeValue, float rs, vec3 cameraPos, bool showDoppler, bool showRedshift) {
  vec3 local = toDiskSpace(hitPos);
  float diskAngle = atan(local.z, local.x);
  float diskRadius = max(length(local.xz), DISK_INNER_FACTOR * rs + EPSILON);
  float rInner = DISK_INNER_FACTOR * rs;
  float rOuter = DISK_OUTER_FACTOR * rs;
  float rNormRaw = (diskRadius - rInner) / max(rOuter - rInner, EPSILON);
  float rNorm = clamp(rNormRaw, 0.0, 1.0);
  vec2 posNorm = local.xz / diskRadius;

  vec3 tempColor;
  if (rNorm < 0.15) {
    tempColor = mix(vec3(1.00, 0.95, 0.80), vec3(1.00, 0.80, 0.40), rNorm / 0.15);
  } else if (rNorm < 0.35) {
    tempColor = mix(vec3(1.00, 0.80, 0.40), vec3(1.00, 0.55, 0.10), (rNorm - 0.15) / 0.20);
  } else if (rNorm < 0.55) {
    tempColor = mix(vec3(1.00, 0.55, 0.10), vec3(0.80, 0.28, 0.03), (rNorm - 0.35) / 0.20);
  } else if (rNorm < 0.75) {
    tempColor = mix(vec3(0.80, 0.28, 0.03), vec3(0.45, 0.10, 0.01), (rNorm - 0.55) / 0.20);
  } else {
    tempColor = mix(vec3(0.45, 0.10, 0.01), vec3(0.12, 0.03, 0.00), (rNorm - 0.75) / 0.25);
  }

  float fiber = fiberTexture(rNorm, posNorm, timeValue);
  fiber = clamp(fiber, 0.0, 1.0);
  // Contrast remap to deepen dark lanes and sharpen bright fibers.
  fiber = fiber * fiber * (3.0 - 2.0 * fiber);
  fiber = fiber * fiber * (3.0 - 2.0 * fiber);
  float fiberMod = mix(0.15, 1.6, fiber);
  float innerSoften = smoothstep(0.0, 0.12, rNorm);
  fiberMod = mix(1.0, fiberMod, innerSoften);

  float spiral = spiralArm(rNormRaw, diskAngle, posNorm, timeValue);
  vec3 spiralColor = vec3(0.60, 0.22, 0.02) * spiral;

  float diskH = abs(local.y);
  float scaleH = (0.06 + 0.05 * rNorm) * diskRadius;
  float vertDensity = exp(-(diskH * diskH) / max(scaleH * scaleH, EPSILON));

  float innerFade = smoothstep(0.0, 0.06, rNormRaw);
  float outerFade = 1.0 - smoothstep(0.88, 1.0, rNormRaw);
  // Explicit radial annulus mask only (no box clipping).
  float hitR = diskRadius;
  float annulusInner = smoothstep(rInner, rInner * 1.08, hitR);
  float annulusOuter = 1.0 - smoothstep(rOuter * 0.92, rOuter, hitR);
  float diskMask = annulusInner * annulusOuter;

  vec3 diskBody = tempColor * fiberMod * vertDensity * innerFade * outerFade * diskMask;
  vec3 diskColor = diskBody + spiralColor * vertDensity;

  vec3 tangent = normalize(vec3(-local.z, 0.0, local.x));
  vec3 toObs = normalize(cameraPos);
  float vDotObs = dot(tangent, toObs);
  float vOverC = clamp(sqrt(rs / (2.0 * diskRadius)), 0.0, 0.45);
  float beta = vOverC * vDotObs;

  if (showDoppler) {
    float D = sqrt((1.0 + beta) / max(1.0 - beta, 0.001));
    diskColor *= pow(D, 4.0);
    diskColor.b += beta * 0.08 * length(diskColor);
    diskColor.r -= beta * 0.05 * length(diskColor);
  }

  if (showRedshift) {
    float z = 1.0 / sqrt(max(1.0 - rs / diskRadius, 0.01));
    float redshiftFactor = clamp(1.0 / z, 0.0, 1.0);
    diskColor.gb *= (0.7 + 0.3 * redshiftFactor);
    diskColor *= (0.6 + 0.4 * redshiftFactor);
  }

  diskColor *= 1.2;

  // Soft luminance compression preserves hue while preventing inner white blowout.
  float diskLum = dot(diskColor, vec3(0.2126, 0.7152, 0.0722));
  if (diskLum > 0.9) {
    float compressed = 0.9 + log(1.0 + diskLum - 0.9) * 0.5;
    diskColor *= compressed / max(diskLum, EPSILON);
  }
  return diskColor;
}

vec3 getBackground(vec3 dir) {
  vec2 sphUV = vec2(atan(dir.z, dir.x) / (2.0 * PI) + 0.5, asin(clamp(dir.y, -0.999, 0.999)) / PI + 0.5);

  vec3 col = vec3(0.0);

  {
    float scale = 150.0;
    vec2 cell = floor(sphUV * scale);
    vec2 f = fract(sphUV * scale);
    float r1 = hash21(cell);
    float threshold = 1.0 - 0.018 * uStarDensity;
    if (r1 > threshold) {
      float r2 = hash21(cell + vec2(17.3, 31.7));
      vec2 sp = vec2(hash21(cell + vec2(0.3, 0.1)), hash21(cell + vec2(0.1, 0.3)));
      float d = length(f - sp);
      float core = 1.0 - smoothstep(0.0, 0.07, d);
      float halo = (1.0 - smoothstep(0.0, 0.18, d)) * 0.3;
      float bright = (0.7 + 0.3 * r2) * (core + halo);
      col += getStarColor(cell, bright, false);
    }
  }

  {
    float scale = 420.0;
    vec2 cell = floor(sphUV * scale);
    vec2 f = fract(sphUV * scale);
    float r1 = hash21(cell);
    float threshold = 1.0 - 0.040 * uStarDensity;
    if (r1 > threshold) {
      float r2 = hash21(cell + vec2(23.4, 41.8));
      vec2 sp = vec2(hash21(cell + vec2(0.5, 0.1)), hash21(cell + vec2(0.1, 0.5)));
      float d = length(f - sp);
      float bright = (1.0 - smoothstep(0.0, 0.055, d)) * (0.2 + 0.35 * r2);
      col += getStarColor(cell, bright, false);
    }
  }

  {
    float scale = 900.0;
    vec2 cell = floor(sphUV * scale);
    vec2 f = fract(sphUV * scale);
    float r1 = hash21(cell);
    float threshold = 1.0 - 0.055 * uStarDensity;
    if (r1 > threshold) {
      float r2 = hash21(cell + vec2(11.2, 55.6));
      vec2 sp = vec2(hash21(cell + vec2(0.7, 0.2)), hash21(cell + vec2(0.2, 0.7)));
      float d = length(f - sp);
      float bright = (1.0 - smoothstep(0.0, 0.04, d)) * 0.09 * r2;
      col += getStarColor(cell, bright, true);
    }
  }

  {
    float scale = 2200.0;
    vec2 cell = floor(sphUV * scale);
    vec2 f = fract(sphUV * scale);
    float r1 = hash21(cell);
    float threshold = 1.0 - 0.08 * uStarDensity;
    if (r1 > threshold) {
      float r2 = hash21(cell + vec2(7.7, 33.3));
      vec2 sp = vec2(hash21(cell + vec2(0.9, 0.3)), hash21(cell + vec2(0.3, 0.9)));
      float d = length(f - sp);
      float bright = (1.0 - smoothstep(0.0, 0.03, d)) * 0.04 * r2;
      col += getStarColor(cell, bright, true);
    }
  }

  return col;
}

vec3 aberrate(vec3 dir, vec3 beta) {
  float b2 = min(dot(beta, beta), 0.95 * 0.95);
  if (b2 < EPSILON) {
    return normalize(dir);
  }
  float gamma = inversesqrt(1.0 - b2);
  float db = dot(dir, beta);
  vec3 parallel = beta * (db / b2);
  vec3 perpendicular = dir - parallel;
  vec3 pParallel = (parallel + beta) / (1.0 + db);
  vec3 pPerp = perpendicular / (gamma * (1.0 + db));
  return normalize(pParallel + pPerp);
}

float observerDoppler(vec3 rayDir) {
  float b2 = min(dot(uObserverVelocity, uObserverVelocity), 0.95 * 0.95);
  if (b2 < EPSILON) {
    return 1.0;
  }
  float gamma = inversesqrt(1.0 - b2);
  float mu = dot(normalize(uObserverVelocity), -normalize(rayDir));
  return 1.0 / (gamma * (1.0 - sqrt(b2) * mu));
}

float photonRingGlow(float closestApproach, float rs) {
  float rPhoton = 1.5 * rs;
  float width = 0.12 * rs;
  float dist = abs(closestApproach - rPhoton);
  float ring = exp(-(dist * dist) / max(width * width * 0.3, EPSILON));
  ring *= step(rs * 1.01, closestApproach);
  return ring * 5.0;
}

RayDeriv geodesicDeriv(RayState state) {
  float r = max(length(state.pos), EPSILON);
  vec3 angularMomentum = cross(state.pos, state.vel);
  float h2 = dot(angularMomentum, angularMomentum);
  float r2 = r * r;
  float r5 = max(r2 * r2 * r, EPSILON);
  float coeff = -SCHWARZSCHILD_BENDING_COEFF * uSchwarzschildRadius * h2 / r5;
  RayDeriv deriv;
  deriv.dPos = state.vel;
  deriv.dVel = state.pos * coeff;
  return deriv;
}

RayState applyDeriv(RayState state, RayDeriv deriv, float dt) {
  RayState outState;
  outState.pos = state.pos + deriv.dPos * dt;
  outState.vel = state.vel + deriv.dVel * dt;
  return outState;
}

RayState rk4Step(RayState state, float dt) {
  RayDeriv k1 = geodesicDeriv(state);
  RayDeriv k2 = geodesicDeriv(applyDeriv(state, k1, dt * 0.5));
  RayDeriv k3 = geodesicDeriv(applyDeriv(state, k2, dt * 0.5));
  RayDeriv k4 = geodesicDeriv(applyDeriv(state, k3, dt));

  state.pos += (k1.dPos + 2.0 * k2.dPos + 2.0 * k3.dPos + k4.dPos) * (dt / 6.0);
  state.vel += (k1.dVel + 2.0 * k2.dVel + 2.0 * k3.dVel + k4.dVel) * (dt / 6.0);
  state.vel = normalize(state.vel);
  return state;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  ndc.x *= uAspect;
  float lens = tan(uFovY * 0.5);
  vec3 rayDir = normalize(uCameraForward + ndc.x * lens * uCameraRight + ndc.y * lens * uCameraUp);

  if (uShowBeaming == 1) {
    rayDir = aberrate(rayDir, uObserverVelocity);
  }

  RayState state;
  state.pos = uCameraPos;
  state.vel = rayDir;

  float rs = uSchwarzschildRadius;
  float horizon = rs;
  float escapeRadius = ESCAPE_RADIUS_FACTOR * rs;
  int odeSteps = uSteps;
  float closestApproach = 1e9;
  vec3 accumulatedDisk = vec3(0.0);
  float diskTransparency = 1.0;
  bool captured = false;

  float c = cos(DISK_TILT);
  float s = sin(DISK_TILT);
  vec3 diskNormal = normalize(vec3(0.0, c, s));

  for (int i = 0; i < MAX_RK4_STEPS; i++) {
    if (i >= odeSteps) {
      break;
    }

    vec3 prevPos = state.pos;
    state = rk4Step(state, uStepSize);

    float r = length(state.pos);
    closestApproach = min(closestApproach, r);

    if (uShowAccretionDisk == 1) {
      float prevPlane = dot(prevPos, diskNormal);
      float currPlane = dot(state.pos, diskNormal);
      // Multi-intersection sampling: accumulate every disk-plane crossing.
      bool crossedPlane = prevPlane * currPlane < 0.0;
      if (crossedPlane) {
        float denom = prevPlane - currPlane;
        float t = abs(denom) < EPSILON ? 0.0 : prevPlane / denom;
        vec3 crossPos = mix(prevPos, state.pos, clamp(t, 0.0, 1.0));
        vec3 hitPos = crossPos;
        vec3 hitLocal = toDiskSpace(hitPos);
        float hitRadius = length(hitLocal.xz);
        bool inDisk = (hitRadius >= DISK_INNER_FACTOR * rs) && (hitRadius <= DISK_ARM_OUTER_FACTOR * rs);
        if (inDisk) {
          vec3 diskColor = shadeDisk(
            hitPos,
            uTime * uTimeScale,
            rs,
            uCameraPos,
            uShowDoppler == 1,
            uShowRedshift == 1
          );
          accumulatedDisk += diskColor * diskTransparency;
          diskTransparency *= 0.45;
        }
      }
    }

    if (r <= horizon) {
      captured = true;
      break;
    }

    if (r >= escapeRadius) {
      break;
    }
  }

  vec3 finalColor = accumulatedDisk;

  if (!captured) {
    vec3 bgDir = normalize(state.vel);
    vec3 background = getBackground(bgDir);

    if (uShowDoppler == 1) {
      float dFactor = observerDoppler(bgDir);
      background *= pow(max(dFactor, 0.45), 1.15);
    }

    if (uShowRedshift == 1) {
      float gMin = sqrt(max(1.0 - rs / max(closestApproach, rs + EPSILON), 0.0));
      background *= mix(vec3(1.0), vec3(1.0, gMin, gMin * gMin), 0.55);
    }

    finalColor += background;
  }

  if (uShowPhotonSphere == 1) {
    vec3 photonRingColor = vec3(1.0, 0.90, 0.70) * photonRingGlow(closestApproach, rs);
    finalColor += photonRingColor;
  }
  outColor = vec4(max(finalColor, 0.0), 1.0);
}

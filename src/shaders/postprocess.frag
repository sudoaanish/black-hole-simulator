#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSceneTexture;
uniform vec2 uResolution;
uniform float uBloomIntensity;
uniform float uExposure;

vec3 brightPass(vec3 hdr) {
  float lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  float threshold = 1.8;
  float softKnee = 0.4;
  float excess = max(lum - (threshold - softKnee), 0.0);
  float weight = min(excess, 2.0 * softKnee);
  weight = weight * weight / (4.0 * softKnee + 0.0001);
  weight += max(lum - threshold, 0.0);
  return hdr * (weight / max(lum, 0.0001));
}

vec3 sampleBloom(vec2 uv, float radiusPx) {
  vec2 texel = 1.0 / uResolution;
  vec2 rx = vec2(radiusPx, 0.0) * texel;
  vec2 ry = vec2(0.0, radiusPx) * texel;
  vec2 rxy = vec2(radiusPx, radiusPx) * texel;
  vec2 rmx = vec2(-radiusPx, radiusPx) * texel;

  vec3 sum = vec3(0.0);
  float wSum = 0.0;

  vec3 c0 = brightPass(texture(uSceneTexture, uv).rgb);
  sum += c0 * 0.24;
  wSum += 0.24;

  vec3 c1 = brightPass(texture(uSceneTexture, uv + rx).rgb);
  vec3 c2 = brightPass(texture(uSceneTexture, uv - rx).rgb);
  vec3 c3 = brightPass(texture(uSceneTexture, uv + ry).rgb);
  vec3 c4 = brightPass(texture(uSceneTexture, uv - ry).rgb);
  sum += (c1 + c2 + c3 + c4) * 0.12;
  wSum += 4.0 * 0.12;

  vec3 c5 = brightPass(texture(uSceneTexture, uv + rxy).rgb);
  vec3 c6 = brightPass(texture(uSceneTexture, uv - rxy).rgb);
  vec3 c7 = brightPass(texture(uSceneTexture, uv + rmx).rgb);
  vec3 c8 = brightPass(texture(uSceneTexture, uv - rmx).rgb);
  sum += (c5 + c6 + c7 + c8) * 0.07;
  wSum += 4.0 * 0.07;

  return sum / max(wSum, 0.0001);
}

vec3 ACESFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 hdr = texture(uSceneTexture, vUv).rgb;

  vec3 tightBloom = sampleBloom(vUv, 3.0);
  vec3 wideBloom = sampleBloom(vUv, 12.0);
  vec3 bloom = (tightBloom * 0.5 + wideBloom * 0.07) * uBloomIntensity;

  hdr *= uExposure;
  hdr += bloom;

  vec3 ldr = ACESFilm(hdr);
  ldr = pow(ldr, vec3(1.0 / 2.2));
  float vig = 1.0 - 0.3 * pow(length(vUv - 0.5) * 2.0, 2.0);
  outColor = vec4(ldr * clamp(vig, 0.0, 1.0), 1.0);
}

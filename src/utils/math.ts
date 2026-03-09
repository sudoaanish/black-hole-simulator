export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = Float32Array;

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale3 = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export const length3 = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

export const normalize3 = (v: Vec3): Vec3 => {
  const len = length3(v);
  if (len <= 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

export const quatIdentity = (): Quat => [0, 0, 0, 1];

export const quatFromAxisAngle = (axis: Vec3, radians: number): Quat => {
  const unit = normalize3(axis);
  const half = radians * 0.5;
  const s = Math.sin(half);
  return [unit[0] * s, unit[1] * s, unit[2] * s, Math.cos(half)];
};

export const quatMultiply = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];

export const quatNormalize = (q: Quat): Quat => {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len <= 1e-8) {
    return [0, 0, 0, 1];
  }
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
};

export const quatConjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export const quatRotateVec3 = (q: Quat, v: Vec3): Vec3 => {
  const qv: Quat = [v[0], v[1], v[2], 0];
  const inv = quatConjugate(q);
  const r = quatMultiply(quatMultiply(q, qv), inv);
  return [r[0], r[1], r[2]];
};

export const mat4Identity = (): Mat4 => {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
};

export const mat4Perspective = (fovy: number, aspect: number, near: number, far: number): Mat4 => {
  const out = new Float32Array(16);
  const f = 1.0 / Math.tan(fovy * 0.5);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
};

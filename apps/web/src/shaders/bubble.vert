varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying vec3 vViewDirection;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vViewDirection = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}

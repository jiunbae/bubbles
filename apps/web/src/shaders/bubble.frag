uniform float u_time;
uniform float u_filmThicknessBase;
uniform vec3 u_bubbleColor;
uniform float u_opacity;
uniform float u_seed;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;
varying vec3 vViewDirection;

vec3 thinFilmInterference(float cosTheta, float thickness) {
  float n = 1.33;
  float sinThetaR = sin(acos(cosTheta)) / n;
  float cosThetaR = sqrt(1.0 - sinThetaR * sinThetaR);
  float opd = 2.0 * n * thickness * cosThetaR;

  vec3 interference;
  interference.r = 0.5 + 0.5 * cos(2.0 * 3.14159 * opd / 650.0);
  interference.g = 0.5 + 0.5 * cos(2.0 * 3.14159 * opd / 510.0);
  interference.b = 0.5 + 0.5 * cos(2.0 * 3.14159 * opd / 475.0);

  return interference;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(vViewDirection);
  float cosTheta = max(dot(normal, viewDir), 0.0);

  // Fresnel
  float F0 = 0.08;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 4.0);

  // Film thickness with per-bubble variation
  vec2 seedOffset = vec2(u_seed * 17.31, u_seed * 43.17);
  float gravityEffect = 1.0 - vUv.y * 0.3;
  float noiseVal = fbm(vUv * 4.0 + seedOffset + u_time * 0.08) * 0.3;
  float thickness = u_filmThicknessBase * (gravityEffect + noiseVal);
  thickness = thickness * 500.0 + 100.0;

  // Iridescent film color
  vec3 filmColor = thinFilmInterference(cosTheta, thickness);

  // Blend with user color
  filmColor = mix(filmColor, u_bubbleColor, 0.45);

  // Boost brightness
  filmColor = filmColor * 1.3 + vec3(0.15);

  // Fake environment reflection using normal direction as color
  vec3 reflectDir = reflect(-viewDir, normal);
  // Sky-like gradient: blue at top, warm at bottom
  float skyGradient = reflectDir.y * 0.5 + 0.5;
  vec3 envColor = mix(
    vec3(0.8, 0.5, 0.3),  // warm horizon
    vec3(0.3, 0.5, 0.9),  // blue sky
    skyGradient
  );

  // Combine
  vec3 reflection = envColor * filmColor * fresnel * 2.0;
  vec3 refraction = filmColor * (1.0 - fresnel) * 0.5;
  vec3 color = reflection + refraction;

  // Specular highlights
  vec3 lightDir = normalize(vec3(5.0, 8.0, 5.0));
  vec3 halfVec = normalize(viewDir + lightDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 128.0);
  color += vec3(1.0) * spec * 1.2;

  vec3 lightDir2 = normalize(vec3(-5.0, 3.0, -5.0));
  vec3 halfVec2 = normalize(viewDir + lightDir2);
  float spec2 = pow(max(dot(normal, halfVec2), 0.0), 128.0);
  color += vec3(0.8, 0.9, 1.0) * spec2 * 0.6;

  // Alpha
  float alpha = mix(0.35, 0.85, 1.0 - cosTheta) * u_opacity;

  gl_FragColor = vec4(color, alpha);
}

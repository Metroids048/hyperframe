window.initLiquidRefraction = function () {
  "use strict";

  const stage = document.querySelector("[data-composition-id]");
  const compositionId = stage.dataset.compositionId;
  const duration = Number(stage.dataset.duration || 8);
  const canvas = document.querySelector(".liquid-canvas");
  const videoA = document.getElementById("texture-a");
  const videoB = document.getElementById("texture-b");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) throw new Error("WebGL2 is required for the liquid-refraction composition");

  canvas.width = 1920;
  canvas.height = 1080;
  gl.viewport(0, 0, 1920, 1080);

  const VERTEX = `#version 300 es
  precision highp float;
  const vec2 POSITIONS[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2(3.0, -1.0),
    vec2(-1.0, 3.0)
  );
  out vec2 vUv;
  void main() {
    vec2 p = POSITIONS[gl_VertexID];
    vUv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
  }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uTime;
  uniform float uDuration;
  uniform float uSwitchAt;
  uniform float uAspectA;
  uniform float uAspectB;
  in vec2 vUv;
  out vec4 outColor;

  const float FRAME_ASPECT = 1.7777777778;
  const float IOR = 1.33;
  const float THICKNESS = 1.5;
  const float DISPERSION = 1.0;
  const float CLEARCOAT = 1.0;
  const float NOISE_SCALE = 1.5;
  const float NOISE_TIME_SCALE = 0.4;
  const float NOISE_AMPLITUDE = 0.12;

  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m *= m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float ease(float t) {
    t = clamp(t, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec4 sampleContained(sampler2D tex, vec2 uv, float sourceAspect) {
    float widthRatio = sourceAspect / FRAME_ASPECT;
    vec2 q = uv;
    if (widthRatio < 1.0) q.x = (uv.x - 0.5) / widthRatio + 0.5;
    else q.y = (uv.y - 0.5) * widthRatio + 0.5;
    float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    return texture(tex, clamp(q, 0.001, 0.999)) * inside;
  }

  float subjectWipe(vec2 uv) {
    if (uSwitchAt > uDuration) return 0.0;
    float p = ease((uTime - (uSwitchAt - 0.28)) / 0.72);
    float boundary = mix(-0.18, 1.18, p);
    float warpedX = uv.x + 0.025 * sin(uv.y * 22.0 + uTime * 2.2)
      + 0.012 * snoise(vec3(uv * 5.0, uTime * NOISE_TIME_SCALE));
    return step(warpedX, boundary);
  }

  vec3 sampleSubject(vec2 uv) {
    vec3 a = sampleContained(uTexA, uv, uAspectA).rgb;
    vec3 b = sampleContained(uTexB, uv, uAspectB).rgb;
    return mix(a, b, subjectWipe(uv));
  }

  vec2 corrected(vec2 uv, vec2 center) {
    vec2 p = uv - center;
    p.x *= FRAME_ASPECT;
    return p;
  }

  vec3 refractedSubject(vec2 uv, vec2 center, float radius, float strength) {
    vec2 p = corrected(uv, center);
    float radial = length(p) / max(radius, 0.001);
    float z = sqrt(max(0.0, 1.0 - radial * radial));
    vec2 normal = p / max(radius, 0.001);
    float eta = 1.0 / IOR;
    float bend = (1.0 - eta) * THICKNESS * strength * (0.42 + (1.0 - z) * 0.8);
    float n = snoise(vec3(p * NOISE_SCALE * 2.4, uTime * NOISE_TIME_SCALE)) * NOISE_AMPLITUDE;
    vec2 offset = normal * bend + vec2(n * 0.075, -n * 0.052);
    float split = 0.0075 * DISPERSION * (0.35 + 1.0 - z);
    vec3 c;
    c.r = sampleSubject(uv + offset * 0.82 + normal * split).r;
    c.g = sampleSubject(uv + offset).g;
    c.b = sampleSubject(uv + offset * 1.18 - normal * split).b;
    return c;
  }

  void carrier(float t, out vec2 center, out float radius) {
    if (t < 0.5) {
      center = vec2(-0.24, 0.54); radius = 0.08;
    } else if (t < 2.4) {
      float p = ease((t - 0.5) / 1.9);
      center = vec2(mix(-0.24, 0.44, p), mix(0.54, 0.48, p));
      radius = mix(0.08, 0.39, p);
    } else if (t < 3.0) {
      center = vec2(0.44, 0.48); radius = 0.39;
    } else if (t < 4.2) {
      float p = ease((t - 3.0) / 1.2);
      center = vec2(mix(0.44, 0.58, p), mix(0.48, 0.52, p)); radius = 0.39;
    } else if (t < 5.8) {
      float p = ease((t - 4.2) / 1.6);
      center = vec2(mix(0.58, 0.76, p), mix(0.52, 0.47, p)); radius = mix(0.39, 0.35, p);
    } else if (t < 6.35) {
      center = vec2(0.76, 0.47); radius = 0.35;
    } else {
      float p = ease((t - 6.35) / 1.65);
      center = vec2(mix(0.76, 1.28, p), mix(0.47, 0.53, p));
      radius = mix(0.35, 0.12, p);
    }
  }

  void compositeLens(inout vec3 color, vec2 uv, vec2 center, float radius, float strength, float glowScale) {
    vec2 p = corrected(uv, center);
    float noise = snoise(vec3(p * NOISE_SCALE * 2.1, uTime * NOISE_TIME_SCALE)) * NOISE_AMPLITUDE;
    float signedEdge = length(p) - radius + noise * radius * 0.18;
    float mask = 1.0 - smoothstep(-0.006, 0.018, signedEdge);
    float edge = 1.0 - smoothstep(0.006, 0.045, abs(signedEdge));
    vec3 lens = refractedSubject(uv, center, radius, strength);
    float radial = clamp(length(p) / max(radius, 0.001), 0.0, 1.0);
    float fresnel = pow(radial, 3.5) * CLEARCOAT;
    lens += fresnel * vec3(0.08, 0.30, 0.36);
    lens += edge * glowScale * vec3(0.04, 0.55, 0.68);
    color = mix(color, lens, mask * 0.94);
    color += edge * glowScale * vec3(0.03, 0.25, 0.31);
  }

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec3 subject = sampleSubject(uv);
    float reveal = smoothstep(6.35, 6.82, uTime) * (1.0 - smoothstep(7.62, 7.98, uTime));
    float opening = smoothstep(0.18, 0.72, uTime);
    vec3 studio = vec3(0.019, 0.027, 0.039);
    studio += 0.035 * vec3(0.0, 0.55, 0.68) * (1.0 - length(uv - vec2(0.2, 0.5)));
    studio += 0.018 * vec3(0.35, 0.15, 0.55) * (1.0 - length(uv - vec2(0.8, 0.42)));
    vec3 color = mix(studio, studio + subject * 0.075, opening);
    color = mix(color, subject, reveal);

    float progress = clamp(uTime / uDuration, 0.0, 1.0);
    for (int i = 0; i < 15; i++) {
      float fi = float(i);
      float lane = (fi / 14.0) - 0.5;
      vec2 c = vec2(-0.18 + progress * 1.38 + lane * 0.72,
        0.50 + 0.34 * sin(fi * 1.71 + progress * 2.15));
      float r = 0.018 + 0.020 * (0.5 + 0.5 * sin(fi * 2.37));
      compositeLens(color, uv, c, r, 0.34, 0.18);
    }

    vec2 heroCenter;
    float heroRadius;
    carrier(uTime, heroCenter, heroRadius);
    compositeLens(color, uv, heroCenter, heroRadius, 0.62, 0.72);

    float transitionEdge = 1.0 - smoothstep(0.0, 0.03,
      abs(uv.x - mix(-0.18, 1.18, ease((uTime - (uSwitchAt - 0.28)) / 0.72))));
    if (uSwitchAt <= uDuration) color += transitionEdge * 0.08 * vec3(0.15, 0.85, 1.0);

    float vignette = smoothstep(0.95, 0.22, length((uv - 0.5) * vec2(0.75, 1.0)));
    color *= mix(0.55, 1.0, vignette);
    float fadeIn = smoothstep(0.0, 0.24, uTime);
    float fadeOut = 1.0 - smoothstep(7.76, 8.0, uTime);
    color *= fadeIn * fadeOut;
    color = pow(max(color, 0.0), vec3(0.94));
    outColor = vec4(color, 1.0);
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
    }
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
  }
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());

  function makeTexture(unit) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([5, 7, 10, 255]));
    return texture;
  }

  const textureA = makeTexture(0);
  const textureB = makeTexture(1);
  const uniforms = {
    time: gl.getUniformLocation(program, "uTime"),
    duration: gl.getUniformLocation(program, "uDuration"),
    switchAt: gl.getUniformLocation(program, "uSwitchAt"),
    aspectA: gl.getUniformLocation(program, "uAspectA"),
    aspectB: gl.getUniformLocation(program, "uAspectB"),
  };
  gl.uniform1i(gl.getUniformLocation(program, "uTexA"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uTexB"), 1);
  gl.uniform1f(uniforms.duration, duration);
  gl.uniform1f(uniforms.switchAt, Number(stage.dataset.switchAt || 99));
  gl.uniform1f(uniforms.aspectA, Number(videoA.dataset.aspect || 1.7777778));
  gl.uniform1f(uniforms.aspectB, Number(videoB.dataset.aspect || 1.7777778));

  function uploadVideo(texture, unit, video) {
    if (!video || video.readyState < 2) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch (_) {
      // The deterministic render host calls renderAt again after media injection.
    }
  }

  function renderAt(time) {
    uploadVideo(textureA, 0, videoA);
    uploadVideo(textureB, 1, videoB);
    gl.useProgram(program);
    gl.uniform1f(uniforms.time, Math.max(0, Math.min(duration, Number(time) || 0)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  window.addEventListener("hf-seek", function (event) {
    renderAt(event.detail.time);
  });
  renderAt(window.__hfThreeTime || 0);

  window.__timelines = window.__timelines || {};
  const tl = window.__timelines[compositionId] || gsap.timeline({ paused: true });
  tl.fromTo(".meta", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.18);
  tl.fromTo(".optic-readout", { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.55, ease: "power2.out" }, 0.32);
  tl.fromTo(".frame-rule.top, .frame-rule.bottom", { scaleX: 0 }, { scaleX: 1, duration: 0.75, ease: "power3.out" }, 0.12);
  tl.fromTo(".frame-rule.left, .frame-rule.right", { scaleY: 0 }, { scaleY: 1, duration: 0.75, ease: "power3.out" }, 0.22);
  tl.fromTo(".scanline", { x: 0, opacity: 0 }, { x: 2600, opacity: 0.72, duration: 8, ease: "none" }, 0);
  tl.fromTo(".terminal-lockup", { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.48, ease: "power3.out" }, 6.72);
  tl.to(".terminal-lockup", { opacity: 0, y: -12, duration: 0.26, ease: "power2.in" }, 7.65);
  tl.to(".meta, .optic-readout, .frame-rule", { opacity: 0, duration: 0.28, ease: "power2.in" }, 7.62);
  window.__timelines[compositionId] = tl;
  tl.seek(0);
};

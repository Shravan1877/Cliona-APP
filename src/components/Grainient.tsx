import React, { useEffect, useRef } from "react";

interface GrainientProps {
  color1?: string;
  color2?: string;
  color3?: string;
  timeSpeed?: number;
  warpStrength?: number;
  warpFrequency?: number;
  warpSpeed?: number;
  warpAmplitude?: number;
  grainAmount?: number;
  grainScale?: number;
  grainAnimated?: boolean;
  contrast?: number;
  saturation?: number;
  zoom?: number;
}

// Helper to parse hex colors to vec3 RGB [0..1]
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = ((num >> 8) & 0xf) / 15;
    const g = ((num >> 4) & 0xf) / 15;
    const b = (num & 0xf) / 15;
    return [r, g, b];
  }
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  return [r, g, b];
}

const VERT_SHADER = `
  attribute vec2 position;
  varying vec2 v_uv;
  void main() {
    v_uv = position * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y; // Flip Y for WebGL coords
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG_SHADER = `
  precision highp float;
  varying vec2 v_uv;

  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;

  uniform float u_time;
  uniform float u_timeSpeed;
  uniform float u_warpStrength;
  uniform float u_warpFrequency;
  uniform float u_warpSpeed;
  uniform float u_warpAmplitude;

  uniform float u_grainAmount;
  uniform float u_grainScale;
  uniform bool u_grainAnimated;

  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_zoom;

  // Simple pseudo-random helper function
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // Zoom/center adjustment
    vec2 uv = (v_uv - 0.5) / u_zoom + 0.5;

    // Time pacing
    float t = u_time * u_timeSpeed;

    // Soft warp mapping based on warp speed, amplitude, and frequency
    float warpTime = u_time * u_warpSpeed * 0.1;
    
    // Wave offsets to map organic motion
    vec2 waveOffset = vec2(
      sin(uv.y * u_warpFrequency + warpTime) * (u_warpAmplitude * 0.005),
      cos(uv.x * u_warpFrequency + warpTime) * (u_warpAmplitude * 0.005)
    );

    vec2 warpedUv = uv + waveOffset * u_warpStrength;

    // Blend values
    float blend1 = sin(warpedUv.x * 2.5 + t) * 0.5 + 0.5;
    float blend2 = cos(warpedUv.y * 2.0 - t * 0.7) * 0.5 + 0.5;
    
    // Combined blend mapping for Color 1, Color 2, Color 3
    vec3 baseColor = mix(u_color1, u_color2, blend1);
    baseColor = mix(baseColor, u_color3, blend2);

    // Color adjustments: Saturation
    vec3 gray = vec3(dot(baseColor, vec3(0.2126, 0.7152, 0.0722)));
    vec3 saturated = mix(gray, baseColor, u_saturation);

    // Contrast logic (around 0.5 baseline)
    vec3 finalColor = (saturated - 0.5) * u_contrast + 0.5;
    finalColor = clamp(finalColor, 0.0, 1.0);

    // Organic noise grain component
    float seed = u_grainAnimated ? rand(v_uv + fract(u_time * 0.05)) : rand(v_uv);
    float grain = (seed - 0.5) * u_grainAmount;

    // Fine-scale grid sampling for grain texture mapping
    float customGrain = (rand(floor(gl_FragCoord.xy / u_grainScale)) - 0.5) * u_grainAmount;

    finalColor += customGrain;
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default function Grainient({
  color1 = "#0d2623",
  color2 = "#000000",
  color3 = "#164039",
  timeSpeed = 0.15,
  warpStrength = 0.6,
  warpFrequency = 2.5,
  warpSpeed = 1.5,
  warpAmplitude = 35.0,
  grainAmount = 0.12,
  grainScale = 1.5,
  grainAnimated = true,
  contrast = 1.1,
  saturation = 0.8,
  zoom = 1.2,
}: GrainientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Try WebGL
    const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      console.warn("WebGL not supported by this browser. Falling back to plain color.");
      return;
    }

    // Shader builder helper
    function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("An error occurred compiling the shaders:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    // Program initialization
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERT_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Unable to initialize the shader program:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Quad geometry positions [x, y]
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Locate Uniforms
    const uColor1Loc = gl.getUniformLocation(program, "u_color1");
    const uColor2Loc = gl.getUniformLocation(program, "u_color2");
    const uColor3Loc = gl.getUniformLocation(program, "u_color3");
    
    const uTimeLoc = gl.getUniformLocation(program, "u_time");
    const uTimeSpeedLoc = gl.getUniformLocation(program, "u_timeSpeed");
    const uWarpStrengthLoc = gl.getUniformLocation(program, "u_warpStrength");
    const uWarpFrequencyLoc = gl.getUniformLocation(program, "u_warpFrequency");
    const uWarpSpeedLoc = gl.getUniformLocation(program, "u_warpSpeed");
    const uWarpAmplitudeLoc = gl.getUniformLocation(program, "u_warpAmplitude");
    
    const uGrainAmountLoc = gl.getUniformLocation(program, "u_grainAmount");
    const uGrainScaleLoc = gl.getUniformLocation(program, "u_grainScale");
    const uGrainAnimatedLoc = gl.getUniformLocation(program, "u_grainAnimated");
    
    const uContrastLoc = gl.getUniformLocation(program, "u_contrast");
    const uSaturationLoc = gl.getUniformLocation(program, "u_saturation");
    const uZoomLoc = gl.getUniformLocation(program, "u_zoom");

    // Handle high-DPI scaling safely
    function resize() {
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl!.viewport(0, 0, width, height);
      }
    }

    window.addEventListener("resize", resize);
    resize();

    let animationFrameId: number;
    let startTime = performance.now();

    // Render loop
    function render() {
      if (!gl || !program) return;

      const elapsed = (performance.now() - startTime) / 1000;

      // Update static & animated uniform sets
      const rgb1 = hexToRgb(color1);
      const rgb2 = hexToRgb(color2);
      const rgb3 = hexToRgb(color3);

      gl.uniform3f(uColor1Loc, rgb1[0], rgb1[1], rgb1[2]);
      gl.uniform3f(uColor2Loc, rgb2[0], rgb2[1], rgb2[2]);
      gl.uniform3f(uColor3Loc, rgb3[0], rgb3[1], rgb3[2]);

      gl.uniform1f(uTimeLoc, elapsed);
      gl.uniform1f(uTimeSpeedLoc, timeSpeed);
      gl.uniform1f(uWarpStrengthLoc, warpStrength);
      gl.uniform1f(uWarpFrequencyLoc, warpFrequency);
      gl.uniform1f(uWarpSpeedLoc, warpSpeed);
      gl.uniform1f(uWarpAmplitudeLoc, warpAmplitude);

      gl.uniform1f(uGrainAmountLoc, grainAmount);
      gl.uniform1f(uGrainScaleLoc, grainScale);
      gl.uniform1i(uGrainAnimatedLoc, grainAnimated ? 1 : 0);

      gl.uniform1f(uContrastLoc, contrast);
      gl.uniform1f(uSaturationLoc, saturation);
      gl.uniform1f(uZoomLoc, zoom);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId = requestAnimationFrame(render);
    }

    render();

    // Cleanup resources nicely
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [
    color1,
    color2,
    color3,
    timeSpeed,
    warpStrength,
    warpFrequency,
    warpSpeed,
    warpAmplitude,
    grainAmount,
    grainScale,
    grainAnimated,
    contrast,
    saturation,
    zoom,
  ]);

  return (
    <canvas
      id="grainient-bg-canvas"
      ref={canvasRef}
      className="w-full h-full block"
      style={{ background: "#000000" }}
    />
  );
}

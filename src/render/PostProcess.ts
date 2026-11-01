import * as THREE from 'three';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float levels;
uniform float outlineStrength;
uniform float vignetteStrength;
uniform float motionBlur;
uniform float glitch;
uniform float glitchSeed;
uniform float wave;
uniform float waveTime;
varying vec2 vUv;

// Матрица Байера 4x4 для упорядоченного дизеринга.
const float BAYER[16] = float[16](
	0.0, 8.0, 2.0, 10.0,
	12.0, 4.0, 14.0, 6.0,
	3.0, 11.0, 1.0, 9.0,
	15.0, 7.0, 13.0, 5.0
);

// Обратная линейная глубина: на плоских поверхностях меняется линейно по экрану, поэтому лапласиан ≈ 0.
float invDepth(vec2 uv) {
	float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
	float linear = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
	return 1.0 / linear;
}

// Радиальное размытие «на скорости»: сэмплы вдоль луча к центру; центр чёткий, края тянутся.
const int BLUR_SAMPLES = 8;
// 0 в центре кадра, к краям — до motionBlur.
float blurMask(vec2 uv) {
	return motionBlur * smoothstep(0.1, 0.7, length(uv - 0.5) * 1.4);
}
vec3 sampleColor(vec2 uv) {
	if (motionBlur <= 0.001) return texture2D(tColor, uv).rgb;
	vec2 toCenter = uv - 0.5;
	float amount = 0.01 * blurMask(uv);
	vec3 sum = vec3(0.0);
	for (int i = 0; i < BLUR_SAMPLES; i++) {
		float t = float(i) / float(BLUR_SAMPLES - 1);
		sum += texture2D(tColor, uv - toCenter * amount * t).rgb;
	}
	return sum / float(BLUR_SAMPLES);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Сбой картинки: часть горизонтальных полос сдвинута вбок, каналы цвета разъехались, кое-где — блоки «битого» цвета.
vec3 glitchColor(vec2 uv) {
	float band = floor(uv.y * 28.0);
	float r = hash(vec2(band, glitchSeed));
	if (r < 0.45 * glitch) uv.x += (hash(vec2(band, glitchSeed + 7.0)) - 0.5) * 0.25 * glitch;
	float split = 0.012 * glitch * (hash(vec2(glitchSeed, 3.0)) + 0.3);
	vec3 color = vec3(
		texture2D(tColor, uv + vec2(split, 0.0)).r,
		texture2D(tColor, uv).g,
		texture2D(tColor, uv - vec2(split, 0.0)).b
	);
	vec2 block = floor(uv * vec2(16.0, 10.0));
	if (hash(block + glitchSeed) < 0.06 * glitch) color = vec3(1.0) - color;
	return color;
}

void main() {
	// Под водой картинка плывёт: мелкие волны сдвигают выборку цвета.
	vec2 uv = vUv + wave * 0.004 * vec2(sin(vUv.y * 22.0 + waveTime * 2.1), cos(vUv.x * 17.0 + waveTime * 1.6));
	vec3 color = glitch > 0.001 ? glitchColor(uv) : sampleColor(uv);

	// Контур: пиксель дальше соседа и в глубине есть излом (край объекта), а не гладкий склон.
	vec2 px = 1.0 / resolution;
	float c = invDepth(vUv);
	float l = invDepth(vUv - vec2(px.x, 0.0));
	float r = invDepth(vUv + vec2(px.x, 0.0));
	float d = invDepth(vUv - vec2(0.0, px.y));
	float u = invDepth(vUv + vec2(0.0, px.y));
	float bend = max(abs(l + r - 2.0 * c), abs(u + d - 2.0 * c));
	float nearer = max(max(l, r), max(u, d));
	float edge = (bend > 0.4 * c && nearer > c * 1.08) ? 1.0 : 0.0;
	// Контуры считаются по нерезмытой глубине — там, где кадр размыт, гасим их, чтобы не торчали резкими штрихами.
	color = mix(color, color * 0.25, edge * outlineStrength * (1.0 - blurMask(vUv)));

	// Виньетка.
	vec2 v = vUv - 0.5;
	color *= 1.0 - vignetteStrength * dot(v, v) * 2.0;

	// Постеризация с дизерингом — в sRGB, чтобы ступени распределялись по восприятию, а не по линейной яркости.
	vec3 s = pow(max(color, 0.0), vec3(1.0 / 2.2));
	ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
	float threshold = (BAYER[p.x + p.y * 4] + 0.5) / 16.0;
	s = floor(s * (levels - 1.0) + threshold) / (levels - 1.0);

	gl_FragColor = vec4(s, 1.0);
}
`;

export interface PostProcessOptions {
	/** Число ступеней на канал (2 — очень грубо, 256 — почти без постеризации). */
	levels?: number;
	/** 0..1 — насколько тёмные контуры на краях объектов. */
	outline?: number;
	/** 0..1 — затемнение по краям кадра. */
	vignette?: number;
}

/**
 * Пост-обработка: сцена рисуется в небольшой буфер, затем один проход даёт контуры по глубине,
 * виньетку и постеризацию цвета с упорядоченным дизерингом.
 */
export class PostProcess {
	private readonly target: THREE.WebGLRenderTarget;
	private readonly quadScene = new THREE.Scene();
	private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private readonly material: THREE.ShaderMaterial;

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		{ levels = 20, outline = 1, vignette = 0.5 }: PostProcessOptions = {}
	) {
		this.target = new THREE.WebGLRenderTarget(1, 1, {
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			depthBuffer: true,
			depthTexture: new THREE.DepthTexture(1, 1),
		});

		this.material = new THREE.ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			depthTest: false,
			depthWrite: false,
			uniforms: {
				tColor: { value: this.target.texture },
				tDepth: { value: this.target.depthTexture },
				resolution: { value: new THREE.Vector2(1, 1) },
				cameraNear: { value: 0.1 },
				cameraFar: { value: 200 },
				levels: { value: levels },
				outlineStrength: { value: outline },
				vignetteStrength: { value: vignette },
				motionBlur: { value: 0 },
				glitch: { value: 0 },
				glitchSeed: { value: 0 },
				wave: { value: 0 },
				waveTime: { value: 0 },
			},
		});
		this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
	}

	/** Размер внутреннего буфера в пикселях (тот же, что у канваса). */
	setSize(width: number, height: number): void {
		this.target.setSize(width, height);
		this.material.uniforms.resolution.value.set(width, height);
	}

	/** 0..1 — радиальное размытие по краям кадра (ускорение). */
	setMotionBlur(amount: number): void {
		this.material.uniforms.motionBlur.value = amount;
	}

	/** 0..1 — сбой картинки; seed меняется каждый кадр, чтобы полосы и блоки прыгали. */
	setGlitch(amount: number, seed: number): void {
		this.material.uniforms.glitch.value = amount;
		this.material.uniforms.glitchSeed.value = seed;
	}

	/** 0..1 — «подводное» колыхание картинки; time — секунды, чтобы волны бежали. */
	setWave(amount: number, time: number): void {
		this.material.uniforms.wave.value = amount;
		this.material.uniforms.waveTime.value = time;
	}

	render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
		this.material.uniforms.cameraNear.value = camera.near;
		this.material.uniforms.cameraFar.value = camera.far;

		this.renderer.setRenderTarget(this.target);
		this.renderer.render(scene, camera);
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.quadScene, this.quadCamera);
	}
}

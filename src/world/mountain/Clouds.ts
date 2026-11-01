import * as THREE from 'three';

/** Слой облаков: от BOTTOM до TOP по высоте, LAYERS горизонтальных плоскостей стороной SIZE м. */
export const CLOUD_BOTTOM = 76;
export const CLOUD_TOP = 100;
const LAYERS = 7;
const SIZE = 4000;
/** Облака растворяются вдали (от камеры), м: край плоскостей не виден. */
const FADE_NEAR = 500;
const FADE_FAR = 1500;
/** Снос облаков ветром, м/с. */
const DRIFT = new THREE.Vector2(1.2, -0.4);

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform vec3 camera;
uniform vec2 offset;
uniform float density;
uniform float base;
uniform float seed;
varying vec3 vWorld;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		sum += noise(p) * amp;
		p *= 2.03;
		amp *= 0.5;
	}
	return sum / 0.9375;
}

void main() {
	vec2 p = (vWorld.xz + offset) / 90.0 + seed;
	float n = fbm(p);
	// Клочья: где шум выше порога — облако; base — подложка (у нижних слоёв сплошнее).
	float a = max(smoothstep(0.42, 0.72, n), base) * density;
	float dist = distance(vWorld.xz, camera.xz);
	a *= 1.0 - smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, dist);
	// Чуть светлее на «вершинах» клочьев.
	gl_FragColor = vec4(color * (0.85 + 0.3 * n), a);
}
`;

/**
 * Море облаков вокруг горы: стопка полупрозрачных плоскостей с шумом. Снизу — сплошная пелена (непогода),
 * сверху — облачная равнина до горизонта: под ней скрыты предгорья и край карты.
 */
export class Clouds {
	readonly group = new THREE.Group();
	private readonly materials: THREE.ShaderMaterial[] = [];
	private readonly offset = new THREE.Vector2();

	constructor() {
		for (let i = 0; i < LAYERS; i++) {
			const k = i / (LAYERS - 1);
			const material = new THREE.ShaderMaterial({
				vertexShader: VERTEX,
				fragmentShader: FRAGMENT,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				fog: false,
				uniforms: {
					color: { value: new THREE.Color() },
					camera: { value: new THREE.Vector3() },
					offset: { value: this.offset },
					// Нижние слои плотнее и сплошнее, верхние — клочьями.
					density: { value: THREE.MathUtils.lerp(0.75, 0.45, k) },
					base: { value: THREE.MathUtils.lerp(0.85, 0.0, k) },
					seed: { value: i * 17.3 },
				},
			});
			this.materials.push(material);
			const plane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), material);
			plane.rotation.x = -Math.PI / 2;
			plane.position.y = THREE.MathUtils.lerp(CLOUD_BOTTOM, CLOUD_TOP, k);
			plane.renderOrder = 2;
			this.group.add(plane);
		}
	}

	/** color — цвет облаков сейчас (по времени суток). */
	update(dt: number, camera: THREE.Vector3, color: THREE.Color): void {
		this.offset.addScaledVector(DRIFT, dt);
		for (const m of this.materials) {
			m.uniforms.camera.value.copy(camera);
			m.uniforms.color.value.copy(color);
		}
	}
}

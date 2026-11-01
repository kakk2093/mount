import * as THREE from 'three';

/** Радиус купола неба, м (меньше camera.far). Звёзды, луна и солнце — чуть внутри. */
const DOME_RADIUS = 600;
const STAR_RADIUS = 560;
const DISC_DISTANCE = 520;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize(position);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 glowDir;
uniform float glowStrength;
varying vec3 vDir;
void main() {
	vec3 dir = normalize(vDir);
	float h = dir.y;
	vec3 color = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
	// Зарево у горизонта со стороны солнца: сильнее всего прямо над ним, к зениту и в стороны сходит.
	vec2 flat2 = normalize(dir.xz + 1e-5);
	float side = pow(max(dot(flat2, normalize(glowDir.xz)), 0.0), 3.0);
	float low = 1.0 - smoothstep(-0.05, 0.35, h);
	color = mix(color, glow, side * low * glowStrength);
	// Ниже горизонта — цвет горизонта (там облака и туман).
	gl_FragColor = vec4(color, 1.0);
}
`;

/** Как выглядит небо сейчас (Sky.setLook). Цвета — живые объекты, их можно менять каждый кадр. */
export interface SkyLook {
	zenith: THREE.Color;
	/** Цвет у горизонта — он же обычно цвет тумана. */
	horizon: THREE.Color;
	glow: THREE.Color;
	/** 0..1 — сила зарева со стороны солнца. */
	glowStrength: number;
	/** 0..1 — видимость звёзд и луны. */
	stars: number;
	moon: number;
	/** Высота солнца над горизонтом, рад (меньше 0 — ещё не взошло), и видимость диска 0..1. */
	sunElevation: number;
	sun: number;
}

/**
 * Небо: купол с градиентом и заревом, звёзды, луна, солнце. Ездит за камерой (update), поэтому всегда
 * «бесконечно далеко»; туман его не трогает. Вид меняется через setLook (время суток).
 */
export class Sky {
	readonly group = new THREE.Group();
	/** Направление на солнце (обновляется в setLook по sunElevation). */
	readonly sunDir = new THREE.Vector3();
	private readonly uniforms;
	private readonly starMat: THREE.PointsMaterial;
	private readonly moonMat = new THREE.MeshBasicMaterial({ color: '#f1ecd6', fog: false, depthWrite: false, transparent: true });
	private readonly sunMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false, depthWrite: false, transparent: true });
	private readonly sunDisc: THREE.Mesh;
	/** Направление на солнце по горизонтали (откуда встаёт). */
	private readonly sunAzimuth: THREE.Vector3;

	constructor(moonDir: THREE.Vector3, sunAzimuth: THREE.Vector3, starCount = 900) {
		this.sunAzimuth = sunAzimuth.clone().setY(0).normalize();
		this.uniforms = {
			zenith: { value: new THREE.Color() },
			horizon: { value: new THREE.Color() },
			glow: { value: new THREE.Color() },
			glowDir: { value: this.sunAzimuth.clone() },
			glowStrength: { value: 0 },
		};
		const dome = new THREE.Mesh(
			new THREE.SphereGeometry(DOME_RADIUS, 32, 16),
			new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms })
		);
		dome.renderOrder = -3;
		this.group.add(dome);

		this.starMat = new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true });
		this.group.add(this._createStars(starCount));

		const moon = new THREE.Mesh(new THREE.CircleGeometry(18, 20), this.moonMat);
		moon.position.copy(moonDir).normalize().multiplyScalar(DISC_DISTANCE);
		moon.lookAt(0, 0, 0);
		moon.renderOrder = -1;
		this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), this.sunMat);
		this.sunDisc.renderOrder = -1;
		this.group.add(moon, this.sunDisc);
	}

	setLook(look: SkyLook): void {
		const u = this.uniforms;
		u.zenith.value.copy(look.zenith);
		u.horizon.value.copy(look.horizon);
		u.glow.value.copy(look.glow);
		u.glowStrength.value = look.glowStrength;
		this.starMat.opacity = look.stars;
		this.starMat.visible = look.stars > 0.01;
		this.moonMat.opacity = look.moon;
		this.moonMat.visible = look.moon > 0.01;
		this.sunMat.opacity = look.sun;
		this.sunMat.visible = look.sun > 0.01;
		const e = look.sunElevation;
		this.sunDir.copy(this.sunAzimuth).multiplyScalar(Math.cos(e)).setY(Math.sin(e));
		this.sunDisc.position.copy(this.sunDir).multiplyScalar(DISC_DISTANCE);
		this.sunDisc.lookAt(0, 0, 0);
	}

	/** Купол — вокруг камеры. */
	update(camera: THREE.Vector3): void {
		this.group.position.copy(camera);
	}

	/** Звёзды — точки на верхней полусфере, разной яркости. */
	private _createStars(count: number): THREE.Points {
		const positions: number[] = [];
		const colors: number[] = [];
		const dir = new THREE.Vector3();
		while (positions.length < count * 3) {
			dir.set(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1);
			if (dir.lengthSq() > 1 || dir.y < 0.08) continue;
			dir.normalize().multiplyScalar(STAR_RADIUS);
			positions.push(dir.x, dir.y, dir.z);
			const b = 0.4 + Math.random() * 0.6;
			colors.push(b, b, b * (0.9 + Math.random() * 0.2));
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		// Буфер рендера маленький (PIXEL_SIZE) — звезда в 1 пиксель уже крупная.
		const points = new THREE.Points(geometry, this.starMat);
		points.renderOrder = -2;
		return points;
	}
}

import * as THREE from 'three';
import type { Input } from '../core/Input.js';
import type { Colliders } from '../physics/Colliders.js';

const WALK_SPEED = 3.3;
/** Бег, м/с. */
const SPRINT_SPEED = 4.5;
const EYE_HEIGHT = 1.7;
const RADIUS = 0.35;
const GRAVITY = 20;
const JUMP_SPEED = 7;
/** Пройденный по земле путь между шагами, м: шагом — короче, бегом — шире. */
const STEP_LENGTH = 1.1;
const SPRINT_STEP_LENGTH = 1.6;
/** Максимальный спуск за кадр, при котором игрок «прилипает» к земле, а не падает. */
const STEP_DOWN = 0.5;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.01;
/** Покачивание при ходьбе: подъём глаз к середине шага (м) и крен в сторону шагающей ноги (рад); бегом — сильнее. */
const BOB_HEIGHT = 0.03;
const SPRINT_BOB_HEIGHT = 0.045;
const BOB_ROLL = 0.006;
/** Тряска (удар, взрыв): подброс взгляда вверх (рад) и дрожь (рад) при силе 1; за сколько секунд затихает. */
const SHAKE_KICK = 0.05;
const SHAKE_JITTER = 0.012;
const SHAKE_TIME = 0.35;
/** Как быстро покачивание нарастает, когда пошёл, и затихает, когда встал (1/с). */
const BOB_BLEND = 8;
/** Как быстро взгляд доворачивается к цели в катсцене (1/с). */
const LOOK_TURN = 3;
/** Крутизну земли меряем по точкам на таком расстоянии вокруг, м. */
const SLOPE_PROBE = 0.4;
/** Уступ, на который можно шагнуть (или спрыгнуть) сверх уклона, м. */
const STEP_UP = 0.35;

export interface Ground {
	getHeightAt(x: number, z: number): number;
	/**
	 * Крутизна в точке (тангенс), если земля знает её лучше обмера вокруг: например, на мосту обмер задел бы
	 * пропасть за краем настила, а сам настил ровный.
	 */
	getSlopeAt?(x: number, z: number): number;
}

/** Контроллер от первого лица: WASD/Shift — движение, Space — прыжок, мышь — обзор. */
export class PlayerController {
	yaw = 0;
	pitch = 0;
	velocityY = 0;
	grounded = true;
	/** Стоим на месте: мышь крутит взгляд, ходьба и прыжок не работают. */
	rooted = false;
	/** Можно ли прыгать. */
	canJump = true;
	/**
	 * Самый крутой склон, на который можно ступить (тангенс: 1 — 45°); Infinity — без ограничения. Круче — не пускает
	 * (и вверх, и вниз), с обрыва не шагнуть: на горе так держимся тропы.
	 */
	maxSlope = Infinity;
	/** Вызывается на каждом шаге по земле; loud > 1 — бег или приземление. */
	onStep: ((loud: number) => void) | null = null;
	/** Направление взгляда в плоскости XZ (нормированное). */
	readonly forward = new THREE.Vector3(0, 0, -1);
	private stepDistance = 0;
	/** Высота глаз сидя; null — стоим. Сидя камера неподвижна, пока не встанешь. */
	private seatedEyeY: number | null = null;
	/** Сидя — в каких пределах можно крутить взгляд (yaw — середина); null — сидя мышь не поворачивает камеру. */
	lookLimit: { yaw: number; yawRange: number; pitchMin: number; pitchMax: number } | null = null;
	private readonly move = new THREE.Vector3();
	/** Фаза шага: +π за шаг (футфолы — на кратных π, как и звук шага); сила покачивания 0..1 и его размах. */
	bobPhase = 0;
	bobWeight = 0;
	private bobHeight = BOB_HEIGHT;
	/** Сила тряски 0..1 — поверх взгляда, сам yaw/pitch не меняет. */
	private shakeAmount = 0;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: Input,
		/** Не readonly: при смене уровня Game подставляет его землю и коллайдеры. */
		public ground: Ground,
		public colliders: Colliders
	) {
		this.camera.rotation.order = 'YXZ';
	}

	get position(): THREE.Vector3 {
		return this.camera.position;
	}

	get seated(): boolean {
		return this.seatedEyeY !== null;
	}

	/** Поставить игрока в точку (x, z) на землю и повернуть на yaw. */
	spawn(x: number, z: number, yaw: number): void {
		this.seatedEyeY = null;
		this.camera.position.set(x, 0, z);
		this.camera.position.y = this._groundEyeY();
		this.yaw = yaw;
		this.pitch = 0;
		this.velocityY = 0;
		this.grounded = true;
		this.bobWeight = 0;
		this._applyRotation();
	}

	/** Сесть: камера на высоте eyeY, взгляд — по yaw и чуть вниз. */
	sit(x: number, z: number, yaw: number, eyeY: number): void {
		this.camera.position.set(x, eyeY, z);
		this.seatedEyeY = eyeY;
		this.yaw = yaw;
		this.pitch = -0.45;
		this.velocityY = 0;
		this.grounded = true;
		this._applyRotation();
	}

	/** Встать в точке (x, z), взгляд — прежний. */
	stand(x: number, z: number): void {
		const pitch = this.pitch;
		this.spawn(x, z, this.yaw);
		this.pitch = pitch;
		this._applyRotation();
	}

	/** Катсцена: поставить глаза и взгляд напрямую. */
	setPose(x: number, y: number, z: number, yaw: number, pitch: number): void {
		this.camera.position.set(x, y, z);
		this.yaw = yaw;
		this.pitch = pitch;
		this._applyRotation();
	}

	/**
	 * Катсцена на ногах: стоим на месте (на земле), взгляд плавно поворачивается к точке target; мышь и ходьба
	 * не работают, тряска затихает как обычно. После — управление продолжается с того взгляда, где остановились.
	 */
	lookToward(target: THREE.Vector3, dt: number): void {
		this.shakeAmount = Math.max(0, this.shakeAmount - dt / SHAKE_TIME);
		this.bobWeight += (0 - this.bobWeight) * (1 - Math.exp(-dt * BOB_BLEND));
		const pos = this.camera.position;
		if (this.seatedEyeY === null) {
			pos.y = this._groundEyeY();
			this.velocityY = 0;
			this.grounded = true;
		}
		const dx = target.x - pos.x;
		const dz = target.z - pos.z;
		const yaw = Math.atan2(-dx, -dz);
		const pitch = THREE.MathUtils.clamp(Math.atan2(target.y - pos.y, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
		// Поворот — по кратчайшей дуге.
		const k = 1 - Math.exp(-dt * LOOK_TURN);
		this.yaw += (THREE.MathUtils.euclideanModulo(yaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI) * k;
		this.pitch += (pitch - this.pitch) * k;
		this._applyRotation();
	}

	/** Тряхнуть камеру: strength 1 — полная. */
	shake(strength = 1): void {
		this.shakeAmount = Math.max(this.shakeAmount, strength);
	}

	update(dt: number): void {
		this.shakeAmount = Math.max(0, this.shakeAmount - dt / SHAKE_TIME);
		this._updateLook();
		if (this.seatedEyeY !== null || this.rooted) return;
		this._updateMovement(dt);
		this._updateVertical(dt);
	}

	private _groundEyeY(): number {
		const { x, z } = this.camera.position;
		return this.ground.getHeightAt(x, z) + EYE_HEIGHT;
	}

	/** Можно ли перейти из (ax, az) в (bx, bz): нет обрыва между ними и там не круче maxSlope (или положе, чем здесь). */
	private _canStep(ax: number, az: number, bx: number, bz: number): boolean {
		if (this.maxSlope === Infinity) return true;
		const d = Math.hypot(bx - ax, bz - az);
		if (d < 1e-6) return true;
		const { ground } = this;
		if (Math.abs(ground.getHeightAt(bx, bz) - ground.getHeightAt(ax, az)) > STEP_UP + d * this.maxSlope) return false;
		const slope = this._slopeAt(bx, bz);
		return slope <= this.maxSlope || slope < this._slopeAt(ax, az);
	}

	/** Крутизна земли в точке (тангенс угла наклона). */
	private _slopeAt(x: number, z: number): number {
		const g = this.ground;
		if (g.getSlopeAt) return g.getSlopeAt(x, z);
		const e = SLOPE_PROBE;
		const dx = g.getHeightAt(x + e, z) - g.getHeightAt(x - e, z);
		const dz = g.getHeightAt(x, z + e) - g.getHeightAt(x, z - e);
		return Math.hypot(dx, dz) / (2 * e);
	}

	/** Смещение глаз от покачивания сейчас (м): внизу — в момент шага, выше всего — в середине. */
	private _bobY(): number {
		return Math.abs(Math.sin(this.bobPhase)) * this.bobHeight * this.bobWeight;
	}

	private _applyRotation(): void {
		// Лёгкий крен в такт шагам: в сторону то одной, то другой ноги.
		// Тряска: взгляд подбрасывает вверх и он возвращается, плюс мелкая дрожь; квадрат — резкий толчок, мягкий спад.
		const shake = this.shakeAmount * this.shakeAmount;
		const jitter = () => (Math.random() * 2 - 1) * SHAKE_JITTER * shake;
		this.camera.rotation.set(
			this.pitch + shake * SHAKE_KICK + jitter(),
			this.yaw + jitter(),
			Math.sin(this.bobPhase) * BOB_ROLL * this.bobWeight + jitter()
		);
		this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
	}

	private _updateVertical(dt: number): void {
		const pos = this.camera.position;

		if (this.grounded && this.canJump && this.input.isDown('Space')) {
			this.velocityY = JUMP_SPEED;
			this.grounded = false;
		}

		if (this.grounded) {
			// Идём по земле: липнем к ней при небольшом спуске, иначе начинаем падать.
			const targetY = this._groundEyeY();
			if (pos.y - targetY - this._bobY() <= STEP_DOWN) {
				pos.y = targetY + this._bobY();
				return;
			}
			this.grounded = false;
			this.velocityY = 0;
		}

		this.velocityY -= GRAVITY * dt;
		pos.y += this.velocityY * dt;

		const groundY = this._groundEyeY();
		if (pos.y <= groundY && this.velocityY <= 0) {
			// Приземление — громкий шаг.
			if (this.velocityY < -3) this.onStep?.(1.6);
			pos.y = groundY;
			this.velocityY = 0;
			this.grounded = true;
		}
	}

	private _updateLook(): void {
		const mouse = this.input.consumeMouseDelta();
		// Сидя мышь не поворачивает камеру (движение сбрасываем, чтобы не было рывка, когда встанешь).
		if (this.seatedEyeY !== null) {
			const lim = this.lookLimit;
			if (!lim) return;
			this.yaw = THREE.MathUtils.clamp(this.yaw - mouse.x * MOUSE_SENSITIVITY, lim.yaw - lim.yawRange, lim.yaw + lim.yawRange);
			this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.y * MOUSE_SENSITIVITY, lim.pitchMin, lim.pitchMax);
			this._applyRotation();
			return;
		}
		this.yaw -= mouse.x * MOUSE_SENSITIVITY;
		this.pitch -= mouse.y * MOUSE_SENSITIVITY;
		this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
		this._applyRotation();
	}

	private _updateMovement(dt: number): void {
		const { input } = this;
		const pos = this.camera.position;
		const startX = pos.x;
		const startZ = pos.z;
		const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
		const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
		const sprint = input.isDown('ShiftLeft');

		if (forward !== 0 || strafe !== 0) {
			const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
			// Движение только в горизонтальной плоскости, направление — по yaw.
			this.move.set(strafe, 0, -forward).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
			pos.x += this.move.x * speed * dt;
			pos.z += this.move.z * speed * dt;
		}

		this.colliders.resolve(pos, RADIUS);
		if (!this._canStep(startX, startZ, pos.x, pos.z)) {
			// Упёрлись в крутизну — скользим вдоль неё: пробуем сдвиг только по X или только по Z.
			if (this._canStep(startX, startZ, pos.x, startZ)) pos.z = startZ;
			else if (this._canStep(startX, startZ, startX, pos.z)) pos.x = startX;
			else pos.set(startX, pos.y, startZ);
		}

		// Шаги считаем по реально пройденному пути (упор в препятствие не даёт шагов).
		const moved = Math.hypot(pos.x - startX, pos.z - startZ);
		if (this.grounded) {
			const stepLength = sprint ? SPRINT_STEP_LENGTH : STEP_LENGTH;
			this.stepDistance += moved;
			this.bobPhase += (moved / stepLength) * Math.PI;
			if (this.stepDistance >= stepLength) {
				this.stepDistance -= stepLength;
				this.onStep?.(sprint ? 1.3 : 1);
			}
		}
		// Покачивание — только пока идём по земле; остановился или в прыжке — плавно затихает.
		const walking = this.grounded && moved > 0.0005;
		const blend = 1 - Math.exp(-dt * BOB_BLEND);
		this.bobWeight += ((walking ? 1 : 0) - this.bobWeight) * blend;
		this.bobHeight += ((sprint ? SPRINT_BOB_HEIGHT : BOB_HEIGHT) - this.bobHeight) * blend;
		this._applyRotation();
	}
}

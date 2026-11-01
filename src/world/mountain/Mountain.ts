import * as THREE from 'three';
import { Colliders } from '../../physics/Colliders.js';
import { PLAYER_NAME, type Dialogue, type Interactable } from '../../core/Interaction.js';
import type { Bounds, Level, LevelHost, SpawnPoint } from '../Level.js';
import type { MusicMood } from '../../audio/Music.js';
import { FireSound } from '../../audio/FireSound.js';
import { WindSound } from '../../audio/WindSound.js';
import { Sky, type SkyLook } from '../Sky.js';
import { Snow } from '../Snow.js';
import { MemoryLevel } from '../MemoryLevel.js';
import { KitchenMemory } from '../KitchenMemory.js';
import { CprMemory } from '../CprMemory.js';
import { OfficeMemory } from '../OfficeMemory.js';
import { GeometryBatch } from '../props/GeometryBatch.js';
import * as P from '../props/Props.js';
import { createNoise2D, createRng } from '../../utils/random.js';
import { MountainShape, PATH_HALF_WIDTH, PATH_START_RADIUS, PEAK_HEIGHT } from './MountainShape.js';
import { MountainTerrain, TERRAIN_HALF } from './MountainTerrain.js';
import { Bridge } from './Bridge.js';
import { Campfire } from './Campfire.js';
import { SHADE_HEAD_Y, Shade } from './Shade.js';
import { Clouds } from './Clouds.js';

const SEED = 1337;
/** Высота луны над горизонтом (y направления); по горизонтали она — с другой стороны неба, чем солнце. */
const MOON_HEIGHT = 0.9;
/** Тени (луна, потом солнце) — квадрат вокруг игрока, м. */
const SHADOW_HALF = 40;
/**
 * Самый крутой склон, на который можно ступить (тангенс, 0.8 ≈ 39°): гора выше предгорий круче — там только по тропе.
 * Меньше нельзя: на тесных разворотах серпантина край тропы скатом к нижнему витку.
 */
const MAX_SLOPE = 0.8;
/** Обмер крутизны — по точкам на таком расстоянии вокруг, м. */
const SLOPE_PROBE = 0.4;
/** Граница леса (высота), м, и как часто пробуем поставить пропс (шаг сетки кандидатов), м. */
const TREE_LINE = 120;
const PROP_STEP = 3.5;
/** Площадка костра: радиус ровного, м, и насколько она сдвинута от оси тропы наружу (вниз по склону). */
const SITE_RADIUS = 3.5;
const SITE_OFFSET = 4;
/** Игрок появляется в лесу метрах в 55 от лагеря (лицом к горе), лагерь (костёр, путник) — сбоку от начала тропы. */
const SPAWN_Z = PATH_START_RADIUS + 56;
/** Вокруг точки появления деревья не ставим, м. */
const SPAWN_CLEAR = 2.5;
const CAMP_X = -4.5;
const CAMP_Z = PATH_START_RADIUS - 1;
/** Имя путника в разговоре: кто он — неизвестно. */
const TRAVELER_NAME = '???';
/** Наклон взгляда, когда возвращаемся к костру из воспоминания, рад. */
const FIRE_SPAWN_PITCH = -0.26;
/** Настил моста заходит на берег на столько, м: сетка земли у края ущелья — скатом вниз, по ней не сойти с моста. */
const BRIDGE_LANDING = 2.5;
/** Финал — когда игрок подошёл к концу тропы (смотровая на вершине) ближе этого, м. */
const SUMMIT_REACH = 2.5;
/** Снегопад стихает совсем, поднявшись на столько выше последнего костра, м. */
const SNOW_STOP_ABOVE = 3;
/** Снежная равнина вокруг (за краем сетки земли), сторона, м. */
const PLAIN_SIZE = 6000;
/** Воспоминания у костров (заглушки): реплики и цвет воздуха. */
const MEMORIES: { color: string; lines: string[] }[] = [
	{ color: '#3a2a1e', lines: ['(Воспоминание у костра в лагере — здесь будет сцена.)'] },
	{ color: '#1e2a3a', lines: ['(Воспоминание второе — здесь будет сцена.)', 'Вода. Я тогда не обернулся.'] },
	{ color: '#2a2e1e', lines: ['(Воспоминание третье — здесь будет сцена.)', 'Дорога. Мы молчали всю дорогу.'] },
	{ color: '#3a3226', lines: ['(Воспоминание последнее — здесь будет сцена.)', 'Вот зачем я поднимался.'] },
];

/**
 * Погода и время суток — по высоте игрока (0 — подножие, 1 — вершина): внизу ночь и метель в тумане под облаками;
 * выше облаков — ясная ночь, звёзды; к вершине светает, снег кончается, на вершине восходит солнце.
 */
interface Weather {
	at: number;
	sky: SkyLook;
	fog: THREE.Color;
	fogDensity: number;
	hemiSky: THREE.Color;
	hemiGround: THREE.Color;
	hemi: number;
	/** Ключевой свет (с тенями): от луны (0) к солнцу (1), цвет и сила. */
	keySun: number;
	key: THREE.Color;
	keyIntensity: number;
	clouds: THREE.Color;
	snow: number;
	wind: number;
}

const c = (hex: string) => new THREE.Color(hex);
const look = (zenith: string, horizon: string, glow: string, glowStrength: number, stars: number, moon: number, sunElevation: number, sun: number): SkyLook => ({
	zenith: c(zenith),
	horizon: c(horizon),
	glow: c(glow),
	glowStrength,
	stars,
	moon,
	sunElevation,
	sun,
});

const WEATHER: Weather[] = [
	{
		// Подножие: ночь, метель, густой туман, сверху — пелена облаков. Звёзд нет нигде: идёт снег.
		at: 0,
		sky: look('#080b14', '#182030', '#000000', 0, 0, 0, -0.35, 0),
		fog: c('#1c2332'),
		fogDensity: 0.04,
		hemiSky: c('#4a5a80'),
		hemiGround: c('#1a2030'),
		hemi: 1.1,
		keySun: 0,
		key: c('#7a8cc0'),
		keyIntensity: 0.5,
		clouds: c('#1a1f2a'),
		snow: 1,
		wind: 2.5,
	},
	{
		// В облаках: серая мгла.
		at: 0.36,
		sky: look('#0a0e1a', '#222a3e', '#3a2a40', 0.1, 0, 0.2, -0.3, 0),
		fog: c('#262d40'),
		fogDensity: 0.032,
		hemiSky: c('#4a5a84'),
		hemiGround: c('#1a1e2a'),
		hemi: 1.1,
		keySun: 0,
		key: c('#7a8cc0'),
		keyIntensity: 0.4,
		clouds: c('#262c3c'),
		snow: 0.8,
		wind: 2,
	},
	{
		// Над облаками: ночь перед рассветом, луна, внизу — облачная равнина.
		at: 0.5,
		sky: look('#0a1028', '#2c2c4a', '#6a3a50', 0.45, 0, 1, -0.15, 0),
		fog: c('#2c2c4a'),
		fogDensity: 0.006,
		hemiSky: c('#3a4a78'),
		hemiGround: c('#1a2234'),
		hemi: 0.85,
		keySun: 0,
		key: c('#9fb2e8'),
		keyIntensity: 1,
		clouds: c('#3a3d58'),
		snow: 0.25,
		wind: 1.5,
	},
	{
		// Светает: небо синеет, у горизонта розово-рыжее.
		at: 0.8,
		sky: look('#22386a', '#c98a7a', '#ff9a6a', 0.9, 0, 0.5, -0.02, 0.6),
		fog: c('#8a7a8a'),
		fogDensity: 0.004,
		hemiSky: c('#8aa0d0'),
		hemiGround: c('#3a3848'),
		hemi: 1,
		keySun: 1,
		key: c('#ff9a6a'),
		keyIntensity: 0.7,
		clouds: c('#b89aa0'),
		snow: 0.05,
		wind: 1,
	},
	{
		// Вершина: восход.
		at: 1,
		sky: look('#4a78b8', '#f4c49a', '#ffc080', 1, 0, 0.2, 0.09, 1),
		fog: c('#e0c0a8'),
		fogDensity: 0.003,
		hemiSky: c('#c8d8f0'),
		hemiGround: c('#6a6070'),
		hemi: 1.3,
		keySun: 1,
		key: c('#ffcf9a'),
		keyIntensity: 1.8,
		clouds: c('#f0d8c8'),
		snow: 0,
		wind: 0.6,
	},
];

/**
 * Гора: тропа серпантином от лагеря у подножия к вершине; на ней — костры (у каждого — воспоминание),
 * по пути — подвесные мосты над ущельями. Погода и время суток меняются с высотой (WEATHER).
 */
export class Mountain implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -325, maxX: 325, minZ: -325, maxZ: 325 };
	readonly spawnPoint: SpawnPoint = { x: 0, z: SPAWN_Z, yaw: 0 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	readonly maxSlope = MAX_SLOPE;
	readonly surface = 'snow';
	readonly shape = new MountainShape(SEED);
	private readonly terrain: MountainTerrain;
	private readonly bridges: Bridge[];
	/** Солнце встаёт ровно по ходу последнего отрезка тропы: выходишь на вершину — и идёшь прямо на него. */
	private readonly sunAzimuth = finalDirection(this.shape);
	/** Луна — напротив солнца (солнце впереди на вершине, луна — за спиной). */
	private readonly moonDir = new THREE.Vector3(-this.sunAzimuth.x, MOON_HEIGHT, -this.sunAzimuth.z).normalize();
	private readonly sky = new Sky(this.moonDir, this.sunAzimuth, 0);
	/** Конец тропы — смотровая на дальнем краю вершины (последний маркер). */
	private readonly summit = new THREE.Vector3();
	/** Дошли до смотровой — финал. */
	private finale = false;
	private readonly clouds = new Clouds();
	private readonly fog = new THREE.FogExp2('#000000', 0.01);
	private readonly hemi = new THREE.HemisphereLight();
	/** Ключевой свет с тенями: ночью — луна, к вершине — солнце. */
	private readonly key = new THREE.DirectionalLight();
	private readonly fireSound = new FireSound();
	private readonly windSound = new WindSound();
	private readonly snow = new Snow(new THREE.Vector3(0, 0, SPAWN_Z));
	/** Выше этой высоты снег не идёт (предпоследний костёр). */
	private snowStopY = Infinity;
	/** Погода сейчас (смесь соседних из WEATHER). */
	private readonly weather: Weather = cloneWeather(WEATHER[0]);
	private readonly keyDir = new THREE.Vector3();
	/** Костры: [0] — лагерь у подножия, дальше — в конце каждого участка тропы (на вершине костра нет). */
	private readonly fires: Campfire[] = [];
	/** Куда встать, вернувшись из воспоминания: у костра, лицом к нему. */
	private readonly fireSpawns: SpawnPoint[] = [];
	private readonly travelerHead = new THREE.Vector3();
	private traveler!: Shade;
	/** Поговорили с фигурой у костра в лагере — только после этого огонь уводит в воспоминание. */
	private talked = false;
	/** Следующий костёр, у которого сесть (0 — в лагере); больше числа костров — всё. */
	private nextFire = 0;
	private time = 0;
	/** Высота игрока 0..1 (подножие..вершина) — по ней погода и музыка. */
	private altitude = 0;

	constructor(private readonly host: LevelHost) {
		const { shape } = this;
		// Площадки под костры — до постройки земли.
		const camp = shape.addSite(CAMP_X, CAMP_Z, SITE_RADIUS + 1.5);
		const sites = [camp];
		const p = new THREE.Vector3();
		for (const s of shape.legEnds.slice(0, -1)) {
			shape.path.pointAt(s, p);
			const r = Math.hypot(p.x, p.z);
			// Наружу от вершины (на вершине — в центре).
			const k = r > 1 ? (r + SITE_OFFSET) / r : 0;
			sites.push(shape.addSite(p.x * k, p.z * k, SITE_RADIUS, 3, p.y));
		}

		this.terrain = new MountainTerrain(shape);
		this.bridges = shape.gullies.map((g) => new Bridge(shape.path, g.bridgeStart - BRIDGE_LANDING, g.bridgeEnd + BRIDGE_LANDING));

		this.scene.fog = this.fog;
		// Равнина до горизонта, без пропсов: квадрат с дырой под сеткой земли (иначе перекрыла бы холмы ниже нуля
		// у подножия). На краю сетки рельеф сходит к нулю — стык без ступеньки.
		const outline = new THREE.Shape();
		outline.moveTo(-PLAIN_SIZE / 2, -PLAIN_SIZE / 2);
		outline.lineTo(PLAIN_SIZE / 2, -PLAIN_SIZE / 2);
		outline.lineTo(PLAIN_SIZE / 2, PLAIN_SIZE / 2);
		outline.lineTo(-PLAIN_SIZE / 2, PLAIN_SIZE / 2);
		const hole = new THREE.Path();
		const h = TERRAIN_HALF;
		hole.moveTo(-h, -h);
		hole.lineTo(-h, h);
		hole.lineTo(h, h);
		hole.lineTo(h, -h);
		outline.holes.push(hole);
		const plain = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshStandardMaterial({ color: '#cdd6e2', roughness: 1 }));
		plain.rotation.x = -Math.PI / 2;
		plain.receiveShadow = true;
		this.scene.add(this.sky.group, this.terrain.mesh, plain, this.clouds.group, this.snow.points, this.hemi);
		for (const bridge of this.bridges) this.scene.add(bridge.mesh);
		this.snow.setColor(new THREE.Color('#9aa6ba'));
		this.key.castShadow = true;
		this.key.shadow.mapSize.set(2048, 2048);
		Object.assign(this.key.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 200 });
		this.scene.add(this.key, this.key.target);

		for (const [i, site] of sites.entries()) {
			const fire = new Campfire(site.x, this.getHeightAt(site.x, site.z), site.z);
			this.fires.push(fire);
			this.scene.add(fire.group);
			this.colliders.add(site.x, site.z, 0.7);
			// Встаём у костра со стороны тропы (к вершине), лицом к огню и глядя чуть вниз — на пламя.
			const r = Math.hypot(site.x, site.z);
			const inX = r > 1 ? -site.x / r : 0;
			const inZ = r > 1 ? -site.z / r : 1;
			const sx = site.x + inX * 1.8;
			const sz = site.z + inZ * 1.8;
			this.fireSpawns.push({ x: sx, z: sz, yaw: Math.atan2(-(site.x - sx), -(site.z - sz)), pitch: FIRE_SPAWN_PITCH });
			this._addFireInteraction(i);
		}
		this.snowStopY = this.fires[this.fires.length - 1].group.position.y + SNOW_STOP_ABOVE;
		shape.path.pointAt(shape.path.length, this.summit);
		this.summit.y = this.getHeightAt(this.summit.x, this.summit.z) + 1.5;
		this._addTraveler(camp.x + 1.6, camp.z);
		this._scatterProps();
		this._applyWeather(0);
	}

	getHeightAt(x: number, z: number): number {
		for (const bridge of this.bridges) {
			const h = bridge.heightAt(x, z);
			if (h !== null) return h;
		}
		return this.terrain.getHeightAt(x, z);
	}

	leave(): void {
		this.fireSound.update(Infinity);
		this.windSound.update(0);
	}

	/** На мосту — ровно (с края не даёт шагнуть проверка обрыва), иначе — по земле вокруг (как в PlayerController). */
	getSlopeAt(x: number, z: number): number {
		if (this.bridges.some((b) => b.heightAt(x, z) !== null)) return 0;
		const t = this.terrain;
		const e = SLOPE_PROBE;
		return Math.hypot(t.getHeightAt(x + e, z) - t.getHeightAt(x - e, z), t.getHeightAt(x, z + e) - t.getHeightAt(x, z - e)) / (2 * e);
	}

	enter(): void {
		this.host.setObjective(this._objectiveText());
	}

	update(dt: number, player: THREE.Vector3): void {
		this.time += dt;
		// 1 — на смотровой (там полный восход), а не на высоте пика.
		this.altitude = THREE.MathUtils.clamp(player.y / (this.summit.y - 1.5), 0, 1);
		this._applyWeather(this.altitude);
		this.sky.update(player);
		this.clouds.update(dt, player, this.weather.clouds);
		this.snow.update(dt, player, this.weather.wind);
		// После последнего костра снег не идёт совсем; метель звучит так же, как идёт снег.
		const snowfall = this.weather.snow * (1 - THREE.MathUtils.smoothstep(player.y, this.snowStopY - 8, this.snowStopY));
		this.snow.setDensity(snowfall);
		this.windSound.update(snowfall);
		// Ключевой свет с тенями — следует за игроком.
		this.key.target.position.copy(player);
		this.key.position.copy(player).addScaledVector(this.keyDir, 80);
		// Костры: огонь и звук ближайшего.
		let nearest = Infinity;
		for (const fire of this.fires) {
			fire.update(this.time, dt);
			nearest = Math.min(nearest, player.distanceTo(fire.flame));
		}
		this.fireSound.update(nearest);
		this.traveler.update(this.time, dt);
		// Дошли до смотровой (после всех костров) — финал: задачи больше нет, музыка в полную силу.
		if (!this.finale && this.nextFire >= this.fires.length && Math.hypot(player.x - this.summit.x, player.z - this.summit.z) < SUMMIT_REACH) {
			this.finale = true;
			this.host.setObjective(null);
		}
	}

	/** Музыка светлеет с высотой: внизу глухо и скупо, к рассвету — открыто. */
	music(): MusicMood {
		return { volume: 1, brightness: THREE.MathUtils.smoothstep(this.altitude, 0.3, 1), finale: this.finale };
	}

	objectiveTarget(): THREE.Vector3 | null {
		if (!this.talked) return this.travelerHead;
		if (this.nextFire < this.fires.length) return this.fires[this.nextFire].flame;
		return this.finale ? null : this.summit;
	}

	/** Погода на высоте altitude (0..1): смесь двух соседних из WEATHER — в небо, туман, свет, облака, снег. */
	private _applyWeather(altitude: number): void {
		let i = 0;
		while (i < WEATHER.length - 2 && altitude > WEATHER[i + 1].at) i++;
		const a = WEATHER[i];
		const b = WEATHER[i + 1];
		const t = THREE.MathUtils.smoothstep(altitude, a.at, b.at);
		const w = this.weather;
		const sky = w.sky;
		sky.zenith.lerpColors(a.sky.zenith, b.sky.zenith, t);
		sky.horizon.lerpColors(a.sky.horizon, b.sky.horizon, t);
		sky.glow.lerpColors(a.sky.glow, b.sky.glow, t);
		for (const k of ['glowStrength', 'stars', 'moon', 'sunElevation', 'sun'] as const) sky[k] = THREE.MathUtils.lerp(a.sky[k], b.sky[k], t);
		for (const k of ['fog', 'hemiSky', 'hemiGround', 'key', 'clouds'] as const) w[k].lerpColors(a[k], b[k], t);
		for (const k of ['fogDensity', 'hemi', 'keySun', 'keyIntensity', 'snow', 'wind'] as const) w[k] = THREE.MathUtils.lerp(a[k], b[k], t);

		this.sky.setLook(sky);
		this.fog.color.copy(w.fog);
		this.fog.density = w.fogDensity;
		this.hemi.color.copy(w.hemiSky);
		this.hemi.groundColor.copy(w.hemiGround);
		this.hemi.intensity = w.hemi;
		this.key.color.copy(w.key);
		this.key.intensity = w.keyIntensity;
		// Свет — от луны к солнцу; солнце низко, но свет не ниже 0.25 (иначе тени во всю гору).
		this.keyDir.copy(this.moonDir).lerp(this.sky.sunDir, w.keySun);
		this.keyDir.y = Math.max(this.keyDir.y, 0.25);
		this.keyDir.normalize();
	}

	private _objectiveText(): string | null {
		if (!this.talked) return 'Подойди к костру';
		if (this.nextFire === 0) return 'Сядь у огня';
		if (this.nextFire < this.fires.length) return 'Дойди до огня';
		return this.finale ? null : 'Поднимись на вершину';
	}

	/** У костра i — сесть: заливка, воспоминание, и обратно к этому же костру. */
	private _addFireInteraction(i: number): void {
		const fire = this.fires[i];
		this.interactables.push({
			position: fire.flame,
			reach: 2.6,
			text: 'сесть у огня',
			enabled: () => this.talked && this.nextFire === i,
			run: () => {
				const onDone = () => {
					this.nextFire = i + 1;
					this.host.goTo(this, this.fireSpawns[i]);
				};
				// Костёр в лагере — реанимация, второй — кухня; остальные пока заглушки.
				if (i === 0) {
					this.host.goTo(new CprMemory(this.host, onDone));
					return;
				}
				if (i === 3) {
					this.host.goTo(new OfficeMemory(this.host, onDone, true));
					return;
				}
				if (i === 2) {
					this.host.goTo(new OfficeMemory(this.host, onDone));
					return;
				}
				if (i === 1) {
					this.host.goTo(new KitchenMemory(this.host, onDone));
					return;
				}
				const memory = MEMORIES[i % MEMORIES.length];
				const level = new MemoryLevel(this.host, {
					color: memory.color,
					lines: memory.lines.map((text) => ({ speaker: PLAYER_NAME, voice: 'player', text })),
					onDone,
				});
				this.host.goTo(level);
			},
		});
	}

	/** Путник у костра в лагере: говорит, куда идти; после разговора — первая задача. */
	private _addTraveler(x: number, z: number): void {
		const y = this.getHeightAt(x, z);
		this.traveler = new Shade(x, y, z);
		// Лицом к огню.
		const camp = this.fires[0].group.position;
		this.traveler.group.lookAt(camp.x, y, camp.z);
		this.scene.add(this.traveler.group);
		this.colliders.add(x, z, 0.4);
		this.travelerHead.set(x, y + SHADE_HEAD_Y, z);
		this.interactables.push({
			position: this.travelerHead,
			reach: 2.5,
			text: 'поговорить',
			dialogue: () => (this.talked ? this._repeatTalk() : this._firstTalk()),
		});
	}

	private _firstTalk(): Dialogue {
		return {
			lines: [
				{ speaker: TRAVELER_NAME, voice: 'low', text: 'А, это ты.' },
				{ speaker: TRAVELER_NAME, voice: 'low', text: 'Давно пора.' },
				{ speaker: TRAVELER_NAME, voice: 'low', text: 'Ну, раз пришёл — поднимайся наверх.' },
				{ speaker: TRAVELER_NAME, voice: 'low', text: 'Здесь, внизу, тебе уже делать нечего.' },
				{ speaker: TRAVELER_NAME, voice: 'low', text: 'Но прежде чем пойдёшь туда — посиди у костра.' },
			],
			onEnd: () => {
				this.talked = true;
				this.host.setObjective(this._objectiveText());
			},
		};
	}

	private _repeatTalk(): Dialogue {
		// Пока не посидел у костра в лагере — напоминает про него.
		const text = this.nextFire === 0 ? 'Посиди у костра.' : 'Поднимайся наверх. Здесь, внизу, тебе делать нечего.';
		return { lines: [{ speaker: TRAVELER_NAME, voice: 'low', text }] };
	}

	/**
	 * Лес и камни: кандидаты по сетке с разбросом; на тропе, у костров и в ущельях ничего. Деревья — до границы леса,
	 * пятнами; на гребнях отрогов — скалы-останцы; выше — камни и сугробы. Всё склеено в два меша (крупное — с тенью,
	 * мелочь — без).
	 */
	private _scatterProps(): void {
		const rng = createRng(SEED + 1);
		const forestNoise = createNoise2D(createRng(SEED + 2));
		const t: P.PropTarget = { solid: new GeometryBatch(rng), small: new GeometryBatch(rng), colliders: this.colliders, rng };
		const { shape, terrain } = this;
		const half = this.bounds.maxX - 5;
		for (let gz = -half; gz < half; gz += PROP_STEP) {
			for (let gx = -half; gx < half; gx += PROP_STEP) {
				const x = gx + (rng() - 0.5) * PROP_STEP;
				const z = gz + (rng() - 0.5) * PROP_STEP;
				if (shape.path.nearest(x, z, PATH_HALF_WIDTH + 3.5)) continue;
				if (shape.sites.some((s) => Math.hypot(x - s.x, z - s.z) < s.radius + 2)) continue;
				if (shape.gullyDepth(x, z) > 0.5) continue;
				if (Math.hypot(x, z - SPAWN_Z) < SPAWN_CLEAR) continue;
				const y = terrain.getHeightAt(x, z);
				const slope = terrain.slopeAt(x, z);
				const crest = shape.relief(x, z, false);
				const forest = THREE.MathUtils.smoothstep(forestNoise(x / 70, z / 70, 3), 0.4, 0.62);
				const belowTreeLine = 1 - THREE.MathUtils.smoothstep(y, TREE_LINE * 0.6, TREE_LINE);
				const roll = rng();
				// Скалы-останцы — на гребнях отрогов, подальше от тропы (крупные — не загораживать проход).
				if (crest > 3 && roll < 0.012 && !shape.path.nearest(x, z, 12)) {
					P.addCrag(t, x, y, z, 0.8 + rng() * 0.8);
				} else if (slope < 1.1 && roll < forest * belowTreeLine * 0.45) {
					const kind = rng() < 0.55 ? 'spruce' : rng() < 0.7 ? 'pine' : rng() < 0.6 ? 'bare' : 'birch';
					P.addTree(t, kind, x, y, z);
				} else if (roll < forest * belowTreeLine * 0.5) {
					if (rng() < 0.5) P.addBush(t, x, y, z);
					else if (rng() < 0.5) P.addStump(t, x, y, z);
					else if (slope < 0.4) P.addLog(t, x, y, z);
				} else if (roll < 0.04 + 0.06 * (y / PEAK_HEIGHT)) {
					P.addRock(t, x, y, z);
				} else if (slope < 0.5 && roll < 0.14) {
					if (rng() < 0.6) P.addDrift(t, x, y, z);
					else if (y < TREE_LINE) P.addStalks(t, x, y, z);
				}
			}
		}
		// Валуны вдоль тропы (с внешней стороны) — подсказывают край и разнообразят серпантин.
		const p = new THREE.Vector3();
		const dir = new THREE.Vector3();
		for (let s = 10; s < shape.path.length - 10; s += 7 + rng() * 9) {
			if (shape.onBridge(s - 4) || shape.onBridge(s + 4)) continue;
			shape.path.pointAt(s, p, dir);
			const side = rng() < 0.5 ? -1 : 1;
			const x = p.x - dir.z * side * (PATH_HALF_WIDTH + 1.2);
			const z = p.z + dir.x * side * (PATH_HALF_WIDTH + 1.2);
			if (shape.sites.some((st) => Math.hypot(x - st.x, z - st.z) < st.radius + 1)) continue;
			// Не на соседнем витке серпантина.
			const hit = shape.path.nearest(x, z, PATH_HALF_WIDTH + 0.8);
			if (hit && Math.abs(hit.s - s) > 10) continue;
			P.addRock(t, x, terrain.getHeightAt(x, z), z);
		}

		const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
		const solid = new THREE.Mesh(t.solid.build(), material);
		solid.castShadow = true;
		solid.receiveShadow = true;
		const small = new THREE.Mesh(t.small.build(), material);
		small.receiveShadow = true;
		this.scene.add(solid, small);
	}
}

/** Направление последнего отрезка тропы (по горизонтали): куда смотрит идущий на смотровую. */
function finalDirection(shape: MountainShape): THREE.Vector3 {
	const { path } = shape;
	const a = path.pointAt(path.length - 10, new THREE.Vector3());
	const b = path.pointAt(path.length, new THREE.Vector3());
	return b.sub(a).setY(0).normalize();
}

/** Копия погоды со своими цветами — их меняем каждый кадр. */
function cloneWeather(w: Weather): Weather {
	return {
		...w,
		sky: { ...w.sky, zenith: w.sky.zenith.clone(), horizon: w.sky.horizon.clone(), glow: w.sky.glow.clone() },
		fog: w.fog.clone(),
		hemiSky: w.hemiSky.clone(),
		hemiGround: w.hemiGround.clone(),
		key: w.key.clone(),
		clouds: w.clouds.clone(),
	};
}

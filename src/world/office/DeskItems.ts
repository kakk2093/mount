import * as THREE from 'three';

/**
 * Всё, что стоит на рабочем столе: мониторы, ноутбук, клавиатура, мышь, кружки и мелочёвка.
 * Соглашение: у предмета «лицом к сидящему» — сторона +Z, начало координат — на столешнице (y = 0).
 */

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, ...extra });

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = h / 2, z = 0): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	return mesh;
}

function cylinder(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 8): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
	mesh.position.y = h / 2;
	mesh.castShadow = true;
	return mesh;
}

export type ScreenKind = 'code' | 'game' | 'art' | 'desktop';

/** Картинка на экране — пиксельный канвас: код, игровой уровень, графический редактор или рабочий стол. */
export function createScreenTexture(kind: ScreenKind, seed: number): THREE.CanvasTexture {
	const w = 48;
	const h = 28;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	let s = seed * 7919 + 13;
	const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;

	if (kind === 'code') {
		ctx.fillStyle = '#1e222a';
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = '#2a2f38';
		ctx.fillRect(0, 0, 8, h);
		const colors = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#abb2bf', '#e06c75'];
		for (let y = 2; y < h - 1; y += 2) {
			let x = 10 + Math.floor(rand() * 3) * 2;
			const words = 1 + Math.floor(rand() * 3);
			for (let i = 0; i < words && x < w - 2; i++) {
				const len = 2 + Math.floor(rand() * 8);
				ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
				ctx.fillRect(x, y, Math.min(len, w - 2 - x), 1);
				x += len + 1;
			}
		}
	} else if (kind === 'game') {
		ctx.fillStyle = '#6fb7e8';
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = '#f2f2ee';
		ctx.fillRect(6 + Math.floor(rand() * 10), 4, 8, 3);
		ctx.fillRect(30, 6, 6, 2);
		ctx.fillStyle = '#5a9a3a';
		ctx.fillRect(0, 21, w, 7);
		ctx.fillStyle = '#8a5a3c';
		ctx.fillRect(0, 24, w, 4);
		ctx.fillStyle = '#c9a23a';
		ctx.fillRect(18, 15, 4, 4);
		ctx.fillRect(26, 13, 4, 4);
		ctx.fillStyle = '#d0302a';
		ctx.fillRect(10, 16, 3, 5);
		// Интерфейс движка вокруг окна игры.
		ctx.fillStyle = '#2b2d30';
		ctx.fillRect(0, 0, w, 2);
		ctx.fillRect(w - 10, 0, 10, h);
		ctx.fillStyle = '#4a4d52';
		for (let y = 4; y < h - 2; y += 3) ctx.fillRect(w - 9, y, 6 + Math.floor(rand() * 2), 1);
	} else if (kind === 'art') {
		ctx.fillStyle = '#3a3c40';
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = '#e8e6e0';
		ctx.fillRect(8, 3, 30, 22);
		// Набросок персонажа на холсте.
		ctx.fillStyle = '#7dc242';
		ctx.fillRect(19, 12, 8, 9);
		ctx.fillStyle = '#f0d2a8';
		ctx.fillRect(20, 6, 6, 6);
		ctx.fillStyle = '#26282b';
		ctx.fillRect(21, 8, 1, 1);
		ctx.fillRect(24, 8, 1, 1);
		// Палитра и инструменты.
		const palette = ['#d0302a', '#f4d94a', '#2c5aa0', '#3fa35a', '#f2a33c', '#7a4a6a'];
		palette.forEach((c, i) => {
			ctx.fillStyle = c;
			ctx.fillRect(41 + (i % 2) * 3, 4 + Math.floor(i / 2) * 3, 2, 2);
		});
		ctx.fillStyle = '#5a5d62';
		for (let y = 3; y < 24; y += 3) ctx.fillRect(2, y, 4, 2);
	} else {
		ctx.fillStyle = '#2f5f8f';
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = '#3f7fb0';
		ctx.fillRect(0, 14, w, 14);
		ctx.fillStyle = '#1b1d20';
		ctx.fillRect(0, h - 3, w, 3);
		// Пара окон: мессенджер и таблица.
		ctx.fillStyle = '#f2f2ee';
		ctx.fillRect(4, 3, 18, 16);
		ctx.fillStyle = '#d0d4da';
		for (let y = 6; y < 18; y += 3) ctx.fillRect(6 + (y % 2) * 4, y, 10, 2);
		ctx.fillStyle = '#e8ebe4';
		ctx.fillRect(25, 5, 20, 15);
		ctx.fillStyle = '#b8c4b0';
		for (let y = 7; y < 19; y += 2) for (let x = 26; x < 44; x += 5) ctx.fillRect(x, y, 4, 1);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** Светящийся экран с картинкой. */
function screenMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({ map: texture, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.75 });
}

/** Монитор ~24": экран в тонкой рамке, ножка и подставка. */
export function createMonitor(screen: THREE.Texture): THREE.Group {
	const group = new THREE.Group();
	const plastic = mat('#1c1d20');
	group.add(box(0.24, 0.015, 0.18, plastic, 0, 0.0075, -0.04));
	group.add(box(0.05, 0.22, 0.03, plastic, 0, 0.12, -0.1));
	const w = 0.6;
	const h = 0.36;
	const y = 0.33;
	group.add(box(w, h, 0.03, plastic, 0, y, -0.07));
	// Утолщение сзади — корпус с электроникой.
	group.add(box(w * 0.6, h * 0.6, 0.04, plastic, 0, y, -0.1));
	const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.03), screenMaterial(screen));
	panel.position.set(0, y, -0.054);
	group.add(panel);
	return group;
}

/** Ноутбук: открытый, экран с картинкой, клавиатура на корпусе. */
export function createLaptop(screen: THREE.Texture): THREE.Group {
	const group = new THREE.Group();
	const shell = mat('#9ea3a8', { metalness: 0.5, roughness: 0.35 });
	group.add(box(0.34, 0.018, 0.24, shell, 0, 0.009, 0));
	group.add(box(0.28, 0.002, 0.1, mat('#2a2b2e'), 0, 0.019, -0.03));
	const lid = new THREE.Group();
	lid.position.set(0, 0.018, -0.12);
	lid.rotation.x = -0.25;
	lid.add(box(0.34, 0.22, 0.01, shell, 0, 0.11, 0));
	const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), screenMaterial(screen));
	panel.position.set(0, 0.115, 0.006);
	lid.add(panel);
	group.add(lid);
	return group;
}

/** Клавиатура: корпус и светлее поле клавиш с парой рядов. Длинная сторона — вдоль X. */
export function createKeyboard(color = '#2a2a2c'): THREE.Group {
	const group = new THREE.Group();
	group.add(box(0.42, 0.018, 0.14, mat(color)));
	const keys = mat('#4a4b4f');
	for (let row = 0; row < 4; row++) {
		group.add(box(row === 3 ? 0.2 : 0.36, 0.006, 0.022, keys, row === 3 ? -0.02 : 0, 0.021, -0.045 + row * 0.03));
	}
	return group;
}

/** Мышь: длинная сторона — вдоль Z (к экрану), колёсико сверху. */
export function createMouse(color = '#2a2a2c'): THREE.Group {
	const group = new THREE.Group();
	group.add(box(0.06, 0.03, 0.1, mat(color)));
	group.add(box(0.008, 0.008, 0.02, mat('#7a7d80'), 0, 0.033, -0.025));
	return group;
}

export function createMousePad(color = '#23262b'): THREE.Mesh {
	return box(0.24, 0.004, 0.2, mat(color));
}

/** Кружка — цвет задаётся, ручка сбоку (+X). */
export function createMug(color = '#c94f3d'): THREE.Group {
	const group = new THREE.Group();
	const m = mat(color);
	group.add(cylinder(0.04, 0.036, 0.09, m));
	const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 8), m);
	handle.position.set(0.045, 0.045, 0);
	// Кольцо — в плоскости XY (вдоль радиуса кружки), а не поперёк: так ручка торчит вбок, как настоящая.
	group.add(handle);
	// Кофе внутри.
	const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.034, 8), mat('#3b2616'));
	coffee.rotation.x = -Math.PI / 2;
	coffee.position.y = 0.075;
	group.add(coffee);
	return group;
}

/** Бумажный стакан с крышкой — кофе навынос. */
export function createPaperCup(): THREE.Group {
	const group = new THREE.Group();
	group.add(cylinder(0.042, 0.032, 0.12, mat('#e8e2d2')));
	const sleeve = cylinder(0.041, 0.037, 0.04, mat('#8a5a3c'));
	sleeve.position.y = 0.055;
	group.add(sleeve);
	const lid = cylinder(0.045, 0.045, 0.015, mat('#f4f4f2'));
	lid.position.y = 0.125;
	group.add(lid);
	return group;
}

/** Стопка листов, чуть разъехавшаяся. */
export function createPaperStack(sheets = 5): THREE.Group {
	const group = new THREE.Group();
	const white = mat('#f2f1ec');
	for (let i = 0; i < sheets; i++) {
		const sheet = box(0.21, 0.003, 0.29, white, (i % 2) * 0.006, 0.0015 + i * 0.003, (i % 3) * 0.004);
		sheet.rotation.y = (i % 3) * 0.04 - 0.04;
		group.add(sheet);
	}
	return group;
}

/** Блокнот на пружине с ручкой сверху. */
export function createNotebook(color = '#2f4f7a'): THREE.Group {
	const group = new THREE.Group();
	group.add(box(0.15, 0.012, 0.21, mat(color)));
	group.add(box(0.012, 0.016, 0.2, mat('#9a9c9e'), -0.07, 0.008));
	const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 5), mat('#26282b'));
	pen.rotation.x = Math.PI / 2;
	pen.rotation.z = 0.3;
	pen.position.set(0.02, 0.018, 0);
	group.add(pen);
	return group;
}

/** Пачка стикеров. */
export function createStickyPad(color = '#f4e04a'): THREE.Mesh {
	return box(0.075, 0.02, 0.075, mat(color));
}

/** Кактус в горшке. */
export function createDeskPlant(): THREE.Group {
	const group = new THREE.Group();
	group.add(cylinder(0.045, 0.035, 0.07, mat('#b5653a')));
	const plant = mat('#4f7a3a', { flatShading: true });
	const trunk = cylinder(0.025, 0.03, 0.11, plant, 6);
	trunk.position.y = 0.12;
	group.add(trunk);
	const arm = cylinder(0.014, 0.016, 0.05, plant, 5);
	arm.position.set(0.028, 0.13, 0);
	arm.rotation.z = -0.5;
	group.add(arm);
	return group;
}

/** Наушники, положенные на стол: оголовье дугой и две чашки. */
export function createHeadphones(color = '#2a2b2e'): THREE.Group {
	const group = new THREE.Group();
	const m = mat(color);
	const band = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 5, 10, Math.PI), m);
	band.rotation.x = -Math.PI / 2;
	band.position.y = 0.015;
	group.add(band);
	for (const x of [-0.08, 0.08]) {
		const cup = cylinder(0.035, 0.035, 0.03, m);
		cup.position.set(x, 0.015, 0);
		group.add(cup);
	}
	return group;
}

/** Бутылка воды: полупрозрачный пластик и синяя крышка. */
export function createWaterBottle(): THREE.Group {
	const group = new THREE.Group();
	const plastic = mat('#bcdcec', { transparent: true, opacity: 0.6, roughness: 0.1 });
	group.add(cylinder(0.032, 0.032, 0.18, plastic));
	const neck = cylinder(0.012, 0.03, 0.04, plastic);
	neck.position.y = 0.2;
	group.add(neck);
	const cap = cylinder(0.014, 0.014, 0.02, mat('#2c5aa0'));
	cap.position.y = 0.23;
	group.add(cap);
	return group;
}

/** Телефон экраном вверх. */
export function createPhone(): THREE.Group {
	const group = new THREE.Group();
	group.add(box(0.075, 0.009, 0.15, mat('#1b1c1e')));
	const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.135), mat('#1f2a36', { emissive: '#1f2a36', emissiveIntensity: 0.3 }));
	glass.rotation.x = -Math.PI / 2;
	glass.position.y = 0.0095;
	group.add(glass);
	return group;
}

/** Банка газировки/энергетика. */
export function createCan(color = '#2c8a4a'): THREE.Group {
	const group = new THREE.Group();
	group.add(cylinder(0.033, 0.033, 0.12, mat(color, { metalness: 0.5, roughness: 0.35 })));
	const top = cylinder(0.03, 0.033, 0.01, mat('#b9bec2', { metalness: 0.7 }));
	top.position.y = 0.125;
	group.add(top);
	return group;
}

/** Настольная лампа на шарнире — плафон смотрит вперёд (+Z) и вниз. */
export function createDeskLamp(color = '#2a2b2e'): THREE.Group {
	const group = new THREE.Group();
	const m = mat(color);
	group.add(cylinder(0.07, 0.08, 0.02, m));
	const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), m);
	lower.position.set(0, 0.16, -0.04);
	lower.rotation.x = -0.3;
	group.add(lower);
	const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 5), m);
	upper.position.set(0, 0.34, 0.04);
	upper.rotation.x = 1.0;
	group.add(upper);
	const shade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8, 1, true), m);
	shade.position.set(0, 0.38, 0.17);
	shade.rotation.x = 0.6;
	group.add(shade);
	const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), mat('#fff3d0', { emissive: '#fff3d0', emissiveIntensity: 1 }));
	bulb.position.set(0, 0.35, 0.19);
	group.add(bulb);
	return group;
}

/** Стикер, приклеенный к рамке монитора (плоский квадратик, лицом к +Z). */
export function createStickyNote(color = '#f4e04a'): THREE.Mesh {
	const note = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), mat(color, { side: THREE.DoubleSide }));
	return note;
}

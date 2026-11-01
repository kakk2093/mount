import * as THREE from 'three';

/**
 * Цвета персонажа. unlit — свет на него не действует (тёмный силуэт у костра); иначе — обычные материалы
 * с плоскими гранями.
 */
export interface CharacterLook {
	coat: string;
	pants: string;
	boots: string;
	skin: string;
	/** Шапка с помпоном; нет — видны волосы (hair). */
	hat?: string;
	/** Шарф; нет — без него. */
	scarf?: string;
	/** Варежки; нет — голые кисти (skin). */
	mittens?: string;
	/** Волосы — шапочкой на макушке; только без шапки. */
	hair?: string;
	/** Стрижка под машинку: волосы — тонким слоем по форме головы, лоб и виски открыты. */
	buzz?: boolean;
	/** Усы (цвет); нет — без усов. */
	mustache?: string;
	eyes: string;
	unlit?: boolean;
}

export interface CharacterParts {
	group: THREE.Group;
	/** Голова (с шапкой и глазами) — для покачивания. */
	head: THREE.Group;
	body: THREE.Mesh;
	hands: THREE.Mesh[];
}

/** Центр головы и верх помпона, м — от земли. */
export const CHARACTER_HEAD_Y = 1.1;
export const CHARACTER_TOP_Y = 1.47;

/**
 * Персонаж в духе Easy Delivery Co., только человек: низкополигональный, коренастый, с большой круглой
 * головой и глазами-точками, в шапке с помпоном, шарфе, дутой куртке и варежках. Лицом — к +z
 * (group.lookAt поворачивает как надо).
 */
export function buildCharacter(look: CharacterLook): CharacterParts {
	const mat = (color: string) =>
		look.unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
	const group = new THREE.Group();
	const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
		const mesh = new THREE.Mesh(geo, mat(color));
		mesh.position.set(x, y, z);
		mesh.castShadow = !look.unlit;
		parent.add(mesh);
		return mesh;
	};

	// Ноги — короткие столбики, ботинки носом вперёд.
	for (const side of [-1, 1]) {
		add(group, new THREE.CylinderGeometry(0.07, 0.075, 0.3, 6), look.pants, side * 0.09, 0.2, 0);
		add(group, new THREE.BoxGeometry(0.13, 0.09, 0.19), look.boots, side * 0.09, 0.045, 0.03);
	}
	// Куртка: дутая, книзу шире; низ — валик.
	const body = add(group, new THREE.CylinderGeometry(0.2, 0.25, 0.52, 7), look.coat, 0, 0.6, 0);
	add(group, new THREE.CylinderGeometry(0.26, 0.26, 0.07, 7), look.coat, 0, 0.36, 0);
	// Руки вдоль тела, чуть врозь; на концах — варежки или голые кисти.
	const hands: THREE.Mesh[] = [];
	for (const side of [-1, 1]) {
		const arm = add(group, new THREE.CapsuleGeometry(0.06, 0.26, 2, 6), look.coat, side * 0.27, 0.66, 0);
		arm.rotation.z = side * 0.18;
		hands.push(add(group, new THREE.IcosahedronGeometry(0.075, 0), look.mittens ?? look.skin, side * 0.31, 0.45, 0.02));
	}
	// Шарф: кольцо на шее и свисающий конец; без шарфа — просто шея.
	if (look.scarf) {
		const scarf = add(group, new THREE.TorusGeometry(0.15, 0.055, 5, 9), look.scarf, 0, 0.88, 0);
		scarf.rotation.x = Math.PI / 2;
		const tail = add(group, new THREE.BoxGeometry(0.08, 0.24, 0.035), look.scarf, 0.09, 0.74, 0.17);
		tail.rotation.z = 0.12;
	} else add(group, new THREE.CylinderGeometry(0.08, 0.1, 0.12, 7), look.skin, 0, 0.88, 0);

	// Голова: крупный граненый шар, глаза-точки, шапка с отворотом и помпоном.
	const head = new THREE.Group();
	head.position.y = CHARACTER_HEAD_Y;
	group.add(head);
	const skull = add(head, new THREE.IcosahedronGeometry(0.25, 1), look.skin, 0, 0, 0);
	skull.scale.set(1, 0.94, 1);
	for (const side of [-1, 1]) {
		const eye = add(head, new THREE.SphereGeometry(0.026, 6, 4), look.eyes, side * 0.085, -0.01, 0.225);
		eye.scale.set(1, 1.3, 0.5);
		eye.castShadow = false;
	}
	if (look.hat) {
		add(head, new THREE.SphereGeometry(0.262, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), look.hat, 0, 0.04, 0);
		const brim = add(head, new THREE.TorusGeometry(0.245, 0.045, 4, 10), look.hat, 0, 0.06, 0);
		brim.rotation.x = Math.PI / 2;
		add(head, new THREE.IcosahedronGeometry(0.07, 0), look.scarf ?? look.hat, 0, CHARACTER_TOP_Y - CHARACTER_HEAD_Y - 0.06, 0);
	} else if (look.hair && look.buzz) {
		// Под машинку: чуть больше черепа, только верх и затылок.
		const hair = add(head, new THREE.SphereGeometry(0.256, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), look.hair, 0, 0.01, -0.015);
		hair.rotation.x = -0.35;
		hair.scale.set(1, 0.94, 1);
	} else if (look.hair) {
		// Волосы: шапочка на макушке, чуть сдвинута назад — лоб открыт.
		const hair = add(head, new THREE.SphereGeometry(0.262, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.4), look.hair, 0, 0.02, -0.03);
		hair.rotation.x = -0.25;
	}

	if (look.mustache) {
		// Усы: густая полоска под носом, края чуть вниз.
		const m = add(head, new THREE.BoxGeometry(0.13, 0.03, 0.03), look.mustache, 0, -0.085, 0.225);
		m.castShadow = false;
		for (const side of [-1, 1]) {
			const tip = add(head, new THREE.BoxGeometry(0.03, 0.04, 0.025), look.mustache, side * 0.065, -0.1, 0.215);
			tip.castShadow = false;
		}
	}

	return { group, head, body, hands };
}

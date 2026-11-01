import { Game } from '@/core/Game';

const game = new Game();
game.start();

// Отладка из консоли браузера (только в dev-сборке).
if (import.meta.env.DEV) Object.assign(window, { game });

import { createApp } from './app.js';
import { env } from './lib/env.js';

createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});

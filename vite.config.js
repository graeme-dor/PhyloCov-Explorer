import { resolve } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        datasets: resolve(__dirname, 'datasets.html'),
        about: resolve(__dirname, 'about.html')
      }
    }
  }
}

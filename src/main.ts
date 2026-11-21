import { DioramaApp } from './app/DioramaApp';

interface ViteHotMeta {
  hot?: {
    dispose: (cb: () => void) => void;
  };
}

function bootstrap(): void {
  const stageElement = document.querySelector<HTMLElement>('#stage');
  const canvasElement = document.querySelector<HTMLCanvasElement>('#diorama-canvas');

  if (!stageElement || !canvasElement) {
    throw new Error('Missing #stage or #diorama-canvas mount elements.');
  }

  const app = new DioramaApp({ stageElement, canvasElement });
  app.start();

  const meta = import.meta as unknown as ViteHotMeta;
  if (meta.hot) {
    meta.hot.dispose(() => {
      app.dispose();
    });
  }
}

bootstrap();

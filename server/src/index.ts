import cron from 'node-cron';
import { app } from './app';
import { config } from './config';
import { runPipeline } from './pipeline/run';

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

if (config.enablePipelineCron) {
  cron.schedule(config.pipelineCron, () => {
    runPipeline().catch((err) => console.error('pipeline run failed', err));
  });
  console.log(`pipeline scheduled: ${config.pipelineCron}`);
}

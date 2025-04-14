import { CronJob } from 'cron';
import { CronConfig } from '../models/CronConfig';
import { SyncHistory } from '../models/SyncHistory';
import { logger } from './logger';
import { resolvers } from '../schema/resolvers';

const activeCronJobs = new Map<string, CronJob>();

function calculateNextRun(schedule: string): Date {
  const job = new CronJob(schedule, () => {});
  return job.nextDate().toJSDate();
}

async function getLastSyncOrganizations(enterpriseName: string): Promise<string[]> {
  try {
    const lastSync = await SyncHistory.findOne({ 
      enterpriseName,
      status: 'completed'
    }).sort({ startTime: -1 });

    if (lastSync && lastSync.organizations) {
      return lastSync.organizations.map(org => org.login);
    }
    return [];
  } catch (error) {
    logger.error('CronManager', 'Error fetching last sync organizations', { error });
    return [];
  }
}

export async function initializeCronJobs() {
  try {
    const configs = await CronConfig.find({ enabled: true });
    for (const config of configs) {
      scheduleCronJob(config.enterpriseName, config.schedule);
    }
  } catch (error) {
    logger.error('CronManager', 'Error initializing cron jobs', { error });
  }
}

export async function scheduleCronJob(enterpriseName: string, schedule: string) {
  try {
    // Stop existing job if any
    stopCronJob(enterpriseName);

    const job = new CronJob(schedule, async () => {
      try {
        logger.info('CronManager', `Starting scheduled sync for ${enterpriseName}`);
        
        // Get organizations from last successful sync
        const selectedOrgs = await getLastSyncOrganizations(enterpriseName);
        
        if (selectedOrgs.length === 0) {
          throw new Error('No organizations found from previous sync');
        }

        // Execute sync using the resolver
        await resolvers.Mutation.syncMigrations(
          undefined,
          { 
            enterpriseName, 
            token: process.env.GITHUB_TOKEN as string,
            selectedOrganizations: selectedOrgs 
          }
        );

        // Update last run time
        await CronConfig.findOneAndUpdate(
          { enterpriseName },
          { 
            lastRun: new Date(),
            nextRun: calculateNextRun(schedule)
          }
        );

      } catch (error) {
        logger.error('CronManager', `Error in cron job for ${enterpriseName}`, { error });
      }
    });

    job.start();
    activeCronJobs.set(enterpriseName, job);

  } catch (error) {
    logger.error('CronManager', `Error scheduling cron job for ${enterpriseName}`, { error });
    throw error;
  }
}

export function stopCronJob(enterpriseName: string) {
  const existingJob = activeCronJobs.get(enterpriseName);
  if (existingJob) {
    existingJob.stop();
    activeCronJobs.delete(enterpriseName);
  }
}

export { calculateNextRun };

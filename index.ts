import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import fs from 'fs';

import workoutURLsFull from './workoutURLs';

dotenv.config();

type Workout = {
  id: string;
  date: string;
  exercises: Exercise[];
};

type Exercise = {
  name: string;
  instructions: string[];
  myNotes?: string[];
};

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

const getDate = async (page: Page): Promise<string> => {
  const maybeDate = await page.$('.start.atc_node');

  if (!maybeDate) {
    return '';
  }

  return maybeDate.evaluate((el) => el.innerHTML);
};

const getExercises = async (page: Page): Promise<Exercise[]> => {
  const workoutBlock = await page.$('.print-cell');

  if (!workoutBlock) {
    return [];
  }

  const exerciseBlocks = await workoutBlock.$$('.tc-list-item.workoutDisplay');

  if (!exerciseBlocks) {
    return [];
  }

  return await Promise.all(
    exerciseBlocks.map(async (exerciseBlock) => {
      const name = await exerciseBlock.$eval('h4', (el) => el.innerHTML);
      const instructions = await exerciseBlock.$eval('p', (el) => el.innerHTML);
      const myNotes = await exerciseBlock.$eval('textarea', (el) => el.value);

      return {
        name,
        instructions: instructions.split('\n'),
        myNotes: myNotes.split('\n'),
      };
    }),
  );
};

// example in: 'https://app.truecoach.co/client/workouts/380805519/edit
// example out: '380805519'
const getIDFromURL = (url: string): string => {
  const splitURL = url.split('/');

  return splitURL[splitURL.length - 2];
};

const getWorkout = async (page: Page, url: string): Promise<Workout> => {
  await page.goto(url, {
    waitUntil: 'networkidle0',
  });

  const workout = {
    id: getIDFromURL(url),
    date: '',
    exercises: [] as Exercise[],
  };

  workout.date = await getDate(page);

  workout.exercises = await getExercises(page);

  return workout;
};

const login = async (
  page: Page,
  email: string,
  password: string,
): Promise<void> => {
  await page.goto('https://app.truecoach.co/login', {
    waitUntil: 'networkidle0',
  });

  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    await page.click('button[type="submit"]'),
  ]);
};

const saveFile = async (obj: {}, fileName: string): Promise<void> => {
  const data = JSON.stringify(obj);

  fs.writeFile(fileName, data, (err) => {
    if (err) {
      throw err;
    }
    console.log(`Data written to ${fileName}`);
  });
};

// WTF: expect the whole thing to take ~20min to run
const workoutURLs = workoutURLsFull.slice(0, 5);
// const workoutURLs = workoutURLsFull;

const main = async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  if (!email || !password) {
    throw new Error('EMAIL or PASSWORD not set in .env file');
  }

  await login(page, email, password);

  const workouts: Record<string, Workout> = {};

  for (const [index, url] of workoutURLs.entries()) {
    const workout = await getWorkout(page, url);

    workouts[workout.id] = workout;
    console.log(index);
    if (index % 10 === 0 && index !== 0) {
      await saveFile(workouts, 'workouts.json');
    }
  }

  await saveFile(workouts, 'workouts.json');

  await browser.close();
};

main();

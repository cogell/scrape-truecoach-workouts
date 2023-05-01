import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import fs from 'fs';

import workoutURLs from './workoutURLs';

dotenv.config();

type Workout = {
  id: string;
  date: string;
  exercises: Exercise[];
};

type Exercise = {
  name: string;
  instructions: string[];
};

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

const getDate = async (page: Page): Promise<string> => {
  const date = await page.$eval('h2', (el) => el.innerText);

  return date;
};

const getExercises = async (page: Page): Promise<Exercise[]> => {
  const workoutBlock = await page.$('.print-cell');

  if (!workoutBlock) {
    return [];
  }

  const exercises = await workoutBlock.$$('.split-left');

  const exerciseHeaders = await Promise.all(
    exercises.map(
      async (exercise) => await exercise.$eval('h4', (el) => el.innerHTML),
    ),
  );

  const exerciseInstructions = await Promise.all(
    exercises.map(
      async (exercise) => await exercise.$eval('p', (el) => el.innerHTML),
    ),
  );

  return exerciseHeaders.map((header, index) => ({
    name: header,
    instructions: exerciseInstructions[index].split('\n'),
  }));
};

const getIDFromURL = (url: string): string => {
  const splitURL = url.split('/');
  const id = splitURL[splitURL.length - 1];

  return id;
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

// FIXME:
const workoutURLsLimited = workoutURLs.slice(0, 3);

const main = async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  if (!email || !password) {
    throw new Error('EMAIL or PASSWORD not set in .env file');
  }

  await login(page, email, password);

  const workouts: Workout[] = [];

  workoutURLsLimited.forEach(async (url) => {
    const workout = await getWorkout(page, url);

    workouts.push(workout);
  });

  await saveFile(workouts, 'workouts.json');

  await browser.close();
};

main();

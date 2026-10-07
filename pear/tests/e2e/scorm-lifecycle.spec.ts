import {test, expect} from '@playwright/test';
import {fixture} from '../helpers.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

test('built human workflow imports/reviews a licensed package, publishes course policy, enrolls, resumes, completes quiz and downloads certificate', async ({page}) => {
  test.setTimeout(90_000); page.setDefaultTimeout(10_000);
  const f = fixture(), origin = 'http://127.0.0.1:4352', font = readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, certificateFont: font, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4353', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  async function login(user: string) {await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill(user); await page.getByLabel('Password', {exact: true}).fill(user + '-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click(); await expect(page.getByRole('button', {name: 'Sign out', exact: true})).toBeVisible();}
  try {
    await content!.listen({host: '127.0.0.1', port: 4353}); await app.listen({host: '127.0.0.1', port: 4352}); await login('admin');
    await page.getByRole('button', {name: 'Administration', exact: true}).click();
    const packages = page.getByRole('region', {name: 'SCORM engine packages', exact: true});
    await packages.getByLabel('SCORM engine ZIP', {exact: true}).setInputFiles({name: 'licensed-original.zip', mimeType: 'application/zip', buffer: interopPackage('2004-4', 'pipwerks')});
    await packages.getByLabel('Content rights and provenance', {exact: true}).fill('Original fixture course and pinned MIT-style pipwerks wrapper; notices retained');
    await packages.getByLabel('I confirm the rights and will review the exact executable package.', {exact: true}).check(); await packages.getByRole('button', {name: 'Import SCORM engine package', exact: true}).click();
    await expect(packages.getByRole('status')).toContainText('ready'); await packages.getByLabel('Engine package review reason', {exact: true}).fill('Reviewed exact fixture source and wrapper license'); await packages.getByRole('button', {name: 'Publish reviewed engine package', exact: true}).click(); await expect(packages.getByRole('article')).toContainText('published');
    const source = page.locator('.admin-courses .learning-row').filter({has: page.getByRole('heading', {name: 'Học tập có chủ đích', exact: true})}); await source.getByRole('button', {name: 'Edit draft', exact: true}).click();
    const editor = page.getByRole('region', {name: 'Course authoring', exact: true}), lesson = editor.getByRole('group', {name: 'Lesson 1', exact: true});
    await editor.getByLabel('Title', {exact: true}).fill('Built SCORM lifecycle'); await lesson.getByRole('combobox', {name: 'Lesson format', exact: true}).selectOption('scorm');
    const pkg = f.db.prepare('SELECT package_id FROM scorm_engine_versions').get()!; await lesson.getByRole('combobox', {name: 'Published SCORM package', exact: true}).selectOption(String(pkg.package_id) + ':1'); await lesson.getByRole('combobox', {name: 'Required SCO status', exact: true}).selectOption('passed'); await lesson.getByLabel('Minimum score for every SCO', {exact: true}).fill('80');
    await editor.getByRole('button', {name: 'Save draft', exact: true}).click(); await expect(page.getByRole('status').filter({hasText: 'Draft saved'})).toBeVisible();
    await page.locator('.admin-courses .learning-row').filter({has: page.getByRole('heading', {name: 'Built SCORM lifecycle', exact: true})}).getByRole('button', {name: 'Publish', exact: true}).click(); await expect(page.getByRole('status').filter({hasText: 'published'})).toBeVisible();
    await page.getByRole('button', {name: 'Sign out', exact: true}).click(); await login('learner-a'); await page.getByRole('combobox', {name: 'Content language', exact: true}).selectOption('vi');
    await page.locator('.cards article').filter({has: page.getByRole('heading', {name: 'Built SCORM lifecycle', exact: true})}).getByRole('button', {name: 'Enroll', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click();
    await page.setViewportSize({width: 390, height: 844});
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click(); await expect(sco.getByText('Licensed wrapper Initialize: true', {exact: true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server'); await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await page.reload(); await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click(); await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click(); await expect(sco.getByText('Licensed entry: resume; bookmark: licensed-page', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Finish licensed content', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted'); expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await page.getByRole('button', {name: 'Start assessment', exact: true}).click(); await page.getByRole('radio', {name: /Tự giải thích rồi đối chiếu/}).check(); await page.getByRole('button', {name: 'Confirm and submit my answers', exact: true}).click(); await expect.poll(() => f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(1);
    await page.getByRole('button', {name: 'Certificate', exact: true}).click(); const certificate = page.getByRole('region', {name: 'Completion certificate', exact: true}), downloaded = page.waitForEvent('download'); await certificate.getByRole('button', {name: 'Download certificate PDF', exact: true}).click();
    const file = await downloaded, text = execFileSync('pdftotext', ['-', '-'], {input: readFileSync((await file.path())!), encoding: 'utf8'}); expect(text).toContain('Built SCORM lifecycle'); expect(text).toContain('Not accredited'); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});

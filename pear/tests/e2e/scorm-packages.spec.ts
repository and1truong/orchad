import {test, expect} from '@playwright/test';
import {createApp} from '../../src/server/app.ts';
import {fixture} from '../helpers.ts';
import {multiFilePackage} from '../scorm-package-fixture.ts';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

test('admin imports multi-file ZIP, reviews exact package, exports original bytes and revokes it in built UI', async ({page}) => {
  const f = fixture(), origin = 'http://127.0.0.1:4337';
  const {app} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist')});
  const bytes = multiFilePackage();
  try {
    await app.listen({port: 4337, host: '127.0.0.1'});
    await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('admin');
    await page.getByLabel('Password', {exact: true}).fill('admin-dev');
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'Administration', exact: true}).click();
    const packages = page.getByRole('region', {name: 'SCORM engine packages', exact: true});
    await packages.getByLabel('SCORM engine ZIP', {exact: true}).setInputFiles({name: 'original-multi.zip', mimeType: 'application/zip', buffer: bytes});
    await packages.getByLabel('Content rights and provenance', {exact: true}).fill('Self-authored original multi-file test fixture');
    await packages.getByLabel('I confirm the rights and will review the exact executable package.', {exact: true}).check();
    await packages.getByRole('button', {name: 'Import SCORM engine package', exact: true}).click();
    await expect(packages.getByRole('status')).toContainText('ready');
    await expect(packages.getByRole('article')).toContainText('quarantined');
    await expect(packages.getByRole('article')).toContainText('Original multi & file package');
    await packages.getByLabel('Engine package review reason', {exact: true}).fill('Reviewed all five exact source files and rights');
    await packages.getByRole('button', {name: 'Publish reviewed engine package', exact: true}).click();
    await expect(packages.getByRole('article')).toContainText('published');
    const downloaded = page.waitForEvent('download');
    await packages.getByRole('button', {name: 'Export original engine ZIP', exact: true}).click();
    expect(readFileSync((await (await downloaded).path())!)).toEqual(bytes);
    await packages.getByRole('button', {name: 'Revoke engine package', exact: true}).click();
    await expect(packages.getByRole('article')).toContainText('revoked');
    expect(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_resources').get()!.n).toBe(5);
    expect(f.db.prepare('SELECT count(*) AS n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});

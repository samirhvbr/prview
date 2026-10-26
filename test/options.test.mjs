import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDisplayOptions, sanitizeDisplayParams, filterKey, readSavedPage } from '../public/options.js';

test('display options keep existing defaults when the link has no options', () => {
  assert.deepEqual(parseDisplayOptions(''), {
    tv: false, rotate: true, pageSeconds: null, pageSize: null, reloadSeconds: 120, repo: '', status: '', query: '',
  });
  assert.equal(parseDisplayOptions('', { savedTv: true }).tv, true);
});

test('an explicit TV option overrides either saved preference', () => {
  assert.equal(parseDisplayOptions('?tv=0', { savedTv: true }).tv, false);
  assert.equal(parseDisplayOptions('?tv=1', { savedTv: false }).tv, true);
  assert.equal(parseDisplayOptions('?tv=yes', { savedTv: true }).tv, true);
});

test('a shared screen link configures modes, pagination and filters together', () => {
  assert.deepEqual(parseDisplayOptions('?tv=1&rotate=0&page_seconds=20&page_size=8&repo=samirhvbr%2Fprview&status=attention&q=fix+cache'), {
    tv: true, rotate: false, pageSeconds: 20, pageSize: 8, reloadSeconds: 120, repo: 'samirhvbr/prview', status: 'attention', query: 'fix cache',
  });
});

test('full document reload defaults to two minutes and accepts disable or bounded intervals', () => {
  assert.equal(parseDisplayOptions('').reloadSeconds, 120);
  assert.equal(parseDisplayOptions('?reload_seconds=0').reloadSeconds, 0);
  assert.equal(parseDisplayOptions('?reload_seconds=30').reloadSeconds, 30);
  assert.equal(parseDisplayOptions('?reload_seconds=86400').reloadSeconds, 86400);
  for (const value of ['-1', '1', '29', '86401', '1.5', '1e3', 'Infinity', 'no', '']) {
    assert.equal(parseDisplayOptions(`?reload_seconds=${value}`).reloadSeconds, 120, value);
  }
});

test('redirect sanitizer strips secrets and unknown or invalid values without adding defaults', () => {
  const input = new URLSearchParams('token=secret&tv=0&rotate=0&page_seconds=020&page_size=999&reload_seconds=0&repo=owner%2Frepo&status=review&q=++fix++&next=https%3A%2F%2Fevil.example');
  assert.equal(sanitizeDisplayParams(input).toString(), 'tv=0&rotate=0&page_seconds=20&reload_seconds=0&repo=owner%2Frepo&status=review&q=fix');
  assert.equal(input.get('token'), 'secret', 'sanitization does not mutate the original parameters');
  assert.equal(sanitizeDisplayParams('?token=secret').toString(), '');
  assert.equal(sanitizeDisplayParams('?reload_seconds=30&reload_seconds=60').toString(), '');
});

test('full reload resumes the page only for the same active filters', () => {
  const key = filterKey({ repo: 'Owner/Repo', status: 'review', query: ' Cache ' });
  const raw = JSON.stringify({ page: 25, filterKey: key });
  assert.equal(readSavedPage(raw, filterKey({ repo: 'owner/repo', status: 'review', query: 'cache' })), 25);
  assert.equal(readSavedPage(raw, filterKey({ repo: 'another/repo', status: 'review', query: 'cache' })), null);
  assert.equal(readSavedPage(raw, filterKey({ repo: 'Owner/Repo', status: 'draft', query: 'cache' })), null);
  assert.equal(readSavedPage(raw, filterKey({ repo: 'Owner/Repo', status: 'review', query: 'other' })), null);
  for (const page of [-1, 1.5, '25', null]) assert.equal(readSavedPage(JSON.stringify({ page, filterKey: key }), key), null);
  assert.equal(readSavedPage('not json', key), null);
  assert.equal(readSavedPage(null, key), null);
});

test('pagination settings accept both boundaries and reject out-of-range or non-integer values', () => {
  assert.equal(parseDisplayOptions('?page_seconds=5&page_size=1').pageSeconds, 5);
  assert.equal(parseDisplayOptions('?page_seconds=300&page_size=20').pageSeconds, 300);
  assert.equal(parseDisplayOptions('?page_seconds=5&page_size=1').pageSize, 1);
  assert.equal(parseDisplayOptions('?page_seconds=300&page_size=20').pageSize, 20);
  for (const value of ['0', '-1', '4', '301', '20.5', '1e2', 'Infinity', 'no', '']) {
    assert.equal(parseDisplayOptions(`?page_seconds=${value}`).pageSeconds, null, value);
  }
  for (const value of ['0', '-1', '21', '2.5', '1e1', '999999', '']) {
    assert.equal(parseDisplayOptions(`?page_size=${value}`).pageSize, null, value);
  }
});

test('unknown, duplicate and invalid options cannot change display defaults', () => {
  assert.deepEqual(parseDisplayOptions('?tv=1&tv=0&rotate=yes&page_size=4&page_size=8&repo=bad/path/extra&status=closed&q=%00&token=secret&unknown=1'), parseDisplayOptions(''));
  assert.equal(parseDisplayOptions('?rotate=0&rotate=1').rotate, true);
  for (const repo of ['owner', '/repo', 'owner/', 'owner/repo/extra', 'owner/..', '-owner/repo', 'owner/repo?token=x']) {
    assert.equal(parseDisplayOptions(`?repo=${encodeURIComponent(repo)}`).repo, '', repo);
  }
});

test('filters support valid repository names and literal search text without markup interpretation', () => {
  assert.equal(parseDisplayOptions('?repo=Org-Name%2Fproject.js_v2').repo, 'Org-Name/project.js_v2');
  for (const status of ['attention', 'review', 'approved', 'draft']) {
    assert.equal(parseDisplayOptions(`?status=${status}`).status, status);
  }
  const query = '<script>alert(1)</script> & contribuição';
  assert.equal(parseDisplayOptions(`?q=${encodeURIComponent(query)}`).query, query);
  assert.equal(parseDisplayOptions(`?q=${'a'.repeat(200)}`).query.length, 200);
  assert.equal(parseDisplayOptions(`?q=${'a'.repeat(201)}`).query, '');
  assert.equal(parseDisplayOptions('?q=++cache++').query, 'cache');
});

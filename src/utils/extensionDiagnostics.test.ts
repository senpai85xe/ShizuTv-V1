import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilitiesBreakdown,
  formatCapabilityBadgeText,
  resolveDiagnosticOverallStatus,
} from './extensionDiagnostics';

test('resolveDiagnosticOverallStatus never returns pass for ping, basic, unsupported, or unverified full checks', () => {
  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'ping',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'basic',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      unsupportedReason: 'Metadata catalog extension does not host video.',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'unsupported',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: false,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: true,
    }),
    'fail',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      errorOccurred: false,
    }),
    'pass',
  );
});

test('buildCapabilitiesBreakdown separates search, listing, and playback capabilities accurately', () => {
  const basicCaps = buildCapabilitiesBreakdown({
    mode: 'basic',
    mediaTab: 'ANIME',
    searchMatched: true,
    listingAvailable: false,
    playbackOrPagesVerified: false,
  });
  assert.equal(basicCaps.metadataSearch, 'verified');
  assert.equal(basicCaps.episodeOrChapterListing, 'untested');
  assert.equal(basicCaps.playbackOrReader, 'untested');
  assert.equal(basicCaps.overallCompatibility, 'partial');

  const metadataCatalogCaps = buildCapabilitiesBreakdown({
    mode: 'full',
    mediaTab: 'ANIME',
    unsupportedReason: 'Metadata catalog only',
    isMetadataCatalogOnly: true,
    searchMatched: true,
    listingAvailable: false,
    playbackOrPagesVerified: false,
  });
  assert.equal(metadataCatalogCaps.metadataSearch, 'verified');
  assert.equal(metadataCatalogCaps.episodeOrChapterListing, 'unsupported');
  assert.equal(metadataCatalogCaps.playbackOrReader, 'unsupported');
  assert.equal(metadataCatalogCaps.overallCompatibility, 'unsupported');

  const novelCaps = buildCapabilitiesBreakdown({
    mode: 'full',
    mediaTab: 'NOVEL',
    searchMatched: false,
    listingAvailable: false,
    playbackOrPagesVerified: false,
  });
  assert.equal(novelCaps.playbackOrReader, 'unsupported');
  assert.equal(novelCaps.overallCompatibility, 'unsupported');
});

test('formatCapabilityBadgeText formats human-readable capability status labels', () => {
  assert.equal(formatCapabilityBadgeText('search', 'verified', 'ANIME'), 'Search: Ready');
  assert.equal(formatCapabilityBadgeText('listing', 'unavailable', 'MANGA'), 'Chapters: Failed');
  assert.equal(formatCapabilityBadgeText('playback', 'unsupported', 'ANIME'), 'Video Playback: Unsupported');
  assert.equal(formatCapabilityBadgeText('playback', 'untested', 'MANGA'), 'Reader Pages: Not Tested');
});

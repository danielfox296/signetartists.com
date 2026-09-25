/**
 * Builds the two Google Forms behind signetartists.com, 2026-09-20:
 *   /for-artists/            -> "Signet Artists: Act Submission"
 *   /preferred-vendors/join/ -> "Signet Artists: Preferred Vendor List"
 * Each form writes to its own new spreadsheet. Run once from
 * script.google.com while signed in as danielchristopherfox@gmail.com
 * (Daniel's call, 2026-09-20: that account owns the forms). The published
 * URLs print in the execution log and go into _src/data/site.json
 * brand.forms. Field lists are the vendor-network handoff's as Daniel
 * ruled on it: no music library, the genre list wider than the roster,
 * rates asked at intake and never published back.
 */

function buildSignetForms() {
  var artist = buildArtistForm();
  var vendor = buildVendorForm();
  Logger.log('ARTIST_FORM_URL=' + artist.url);
  Logger.log('ARTIST_SHEET_URL=' + artist.sheet);
  Logger.log('VENDOR_FORM_URL=' + vendor.url);
  Logger.log('VENDOR_SHEET_URL=' + vendor.sheet);
  return {artist: artist, vendor: vendor};
}

function publishAndSheet_(form, sheetName) {
  var ss = SpreadsheetApp.create(sheetName);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  form.setAcceptingResponses(true);
  // Newer Forms keep a form unpublished until told otherwise; older
  // deployments have no such method.
  try { form.setPublished(true); } catch (e) {}
  return {url: form.getPublishedUrl(), sheet: ss.getUrl(), edit: form.getEditUrl()};
}

function text_(form, title, required, help) {
  var it = form.addTextItem().setTitle(title).setRequired(required);
  if (help) it.setHelpText(help);
  return it;
}

function para_(form, title, required, help) {
  var it = form.addParagraphTextItem().setTitle(title).setRequired(required);
  if (help) it.setHelpText(help);
  return it;
}

function email_(form) {
  var it = form.addTextItem().setTitle('Email').setRequired(true);
  it.setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  return it;
}

function buildArtistForm() {
  var form = FormApp.create('Signet Artists: Act Submission');
  form.setTitle('Signet Artists: Act Submission');
  form.setDescription("Tell us about your act. We read everything and reach out when there's a fit.");
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setProgressBar(false);
  form.setConfirmationMessage("Thanks. We read every submission, and when there's a fit we'll write back and set up a call.");

  text_(form, 'Act name', true);
  text_(form, 'Leader name', true);
  email_(form);
  text_(form, 'Phone', true);
  text_(form, 'Website', false);
  para_(form, 'Video or audio links', true, 'Live footage is best. Paste as many links as you like.');
  para_(form, 'Song list', true, 'Paste it or link it. Enough songs for a three-hour event.');
  text_(form, 'Instagram', false);

  var genres = form.addCheckboxItem().setTitle('Genres').setRequired(true);
  genres.setChoiceValues([
    'Jazz', 'Singer-songwriter', 'Pop and rock covers', 'Classic rock', 'Blues',
    'Soul and R&B', 'Funk', 'Yacht rock', 'Americana and bluegrass', 'Country',
    'Flamenco and Spanish guitar', 'Latin', 'Mariachi', 'Strings (solo, trio or quartet)',
    'Piano', 'Downtempo and electronic', 'DJ, open format', 'Hip-hop and Top 40',
    'Motown', 'Reggae', 'Sound bath and sound healing'
  ]);
  genres.showOtherOption(true);

  var sizes = form.addCheckboxItem().setTitle('Sizes you offer').setRequired(true);
  sizes.setChoiceValues(['Solo', 'Duo', 'Trio', 'Quartet', 'Larger']);

  text_(form, 'Typical rate for a 3-hour event', true);
  text_(form, 'Travel radius from Denver', true);

  form.addMultipleChoiceItem().setTitle('Do you bring your own PA?').setRequired(true)
    .setChoiceValues(['Yes', 'No', 'Depends on the size']);
  form.addMultipleChoiceItem().setTitle('Liability insurance').setRequired(true)
    .setChoiceValues(['Yes', 'No', 'Willing to get it']);
  form.addMultipleChoiceItem().setTitle('How fast can you confirm a date?').setRequired(true)
    .setChoiceValues(['Within a few hours', 'Same day', 'A day or two']);

  text_(form, 'Events played in the last 12 months', false);
  para_(form, 'Anything else we should know', false);

  return publishAndSheet_(form, 'Signet Artists: Act Submissions (responses)');
}

function buildVendorForm() {
  var form = FormApp.create('Signet Artists: Preferred Vendor List');
  form.setTitle('Signet Artists: Preferred Vendor List');
  form.setDescription("A few details so we know when you're the right call.");
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setProgressBar(false);
  form.setConfirmationMessage("Thanks. We read every application, and if you're a fit we'll write back and put you on the list.");

  text_(form, 'Business name', true);
  text_(form, 'Contact name', true);
  email_(form);
  text_(form, 'Phone', true);

  form.addListItem().setTitle('Category').setRequired(true).setChoiceValues([
    'Venue', 'Planning and coordination', 'Photography', 'Videography',
    'Catering', 'Design and florals', 'Other'
  ]);

  text_(form, 'Website', true);
  text_(form, 'Instagram', false);
  text_(form, 'Service area', true);
  text_(form, 'Starting price or typical range', true);

  var types = form.addCheckboxItem().setTitle('Event types you work most').setRequired(true);
  types.setChoiceValues(['Weddings', 'Corporate', 'Private parties', 'Nonprofit']);
  types.showOtherOption(true);

  para_(form, 'Two recent events, with the planner or venue if you can', false);

  form.addMultipleChoiceItem().setTitle('Liability insurance').setRequired(true)
    .setChoiceValues(['Yes', 'No']);

  text_(form, 'Who suggested you get in touch', false);

  return publishAndSheet_(form, 'Signet Artists: Preferred Vendor List (applications)');
}

/** Trashes the half-built draft the browser session left behind (not permanent). */
function trashBrowserDraft() {
  DriveApp.getFileById('17hpPs6z9mN4oY5rDOSy9CJy3LVJRO2XHCmJkK3UHFao').setTrashed(true);
}

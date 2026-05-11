'use strict';

const buildPrompt = ({ previousItems }) => {
  const previousItemsJson = JSON.stringify(previousItems ?? []);

  return `Return JSON only. List visible physical items in this CCTV image.

PreviousItems are naming hints only. If a current item looks like the same object in the same rough area, reuse its previous name and loc exactly. Otherwise choose a simple name.

Use one entry per visible physical item. Do not use counts. If several items are too small or clustered to separate, use one grouped name like "group of birds".

If visible text appears on an item, include text as an array: [{"v":"text here","conf":"high"}]. Use this for signs, labels, screens, license plates, numbers, or logos. If unsure, include the best guess with low or medium confidence. For a matched item, keep previous low-confidence text guesses unless the current text is high-confidence and clearly replaces them.

loc must be one of: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right.

No events or stories. No markdown. No extra text.

PreviousItems:
${previousItemsJson}`;
};

module.exports = {
  buildPrompt
};

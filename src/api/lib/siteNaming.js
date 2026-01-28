import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
  languages,
  countries,
  names
} from 'unique-names-generator';
import fs from 'fs/promises';

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

const acceptableWordOrder = () => {
  const wordOrders = [];
  wordOrders.push([adjectives, colors, animals]);
  wordOrders.push([languages, adjectives, colors]);
  wordOrders.push([countries, colors]);
  wordOrders.push([languages, colors]);
  wordOrders.push([animals, names]);
  wordOrders.push([languages, animals]);
  wordOrders.push([colors, animals]);
  wordOrders.push([adjectives, animals]);
  wordOrders.push([adjectives, colors]);
  wordOrders.push([names, colors]);
  wordOrders.push([languages, countries]);
  return shuffleArray(wordOrders)[0];
};

export function generateRandomSubdomain(prefix = 'site') {
  const wordOrder = acceptableWordOrder();

  const randomName = uniqueNamesGenerator({
    dictionaries: wordOrder,
    length: wordOrder.length,
    separator: '-'
  });

  return prefix + '-' + randomName
    .normalize('NFD')                  // split letters + accents
    .replace(/[\u0300-\u036f]/g, '')   // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')        // final safety pass
    .replace(/--+/g, '-')              // collapse dashes
    .replace(/^-+|-+$/g, '');
}

export function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

export async function getUniqueFolderNameSuffix(sitesDir, slug) {
  let entries;

  try {
    entries = await fs.readdir(sitesDir, { withFileTypes: true });
  } catch {
    // If sites dir doesn't exist yet, no suffix needed
    return '';
  }

  const used = new Set();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (entry.name === slug) {
      used.add(1);
      continue;
    }

    const match = entry.name.match(
      new RegExp(`^${slug}-(\\d+)$`)
    );

    if (match) {
      used.add(Number(match[1]));
    }
  }

  if (!used.has(1)) {
    return '';
  }

  let i = 2;
  while (used.has(i)) i++;

  return `-${i}`;
}

/* Royalty-free local photos (Unsplash licence: free to use, credit appreciated).
 * Every caption says only what the photographer's own description supports. */
const U = (id, p) => `https://unsplash.com/photos/${p}`;
const LIB = {
  lake:     { id: 'photo-1597684309783-a06f1ec51d37', by: 'Mick Haupt', page: 'https://unsplash.com/photos/_5xG0RAxw-Y', alt: 'Forested shoreline of Lake Wylie on a drizzly morning, seen from the water on the North Carolina side', cap: 'Lake Wylie from the North Carolina side, on a drizzly morning.' },
  kayak:    { id: 'photo-1692627538268-428324157dd9', by: 'Wes Hicks', page: 'https://unsplash.com/photos/Vcx8uuwW5Xw', alt: 'A blue kayak resting on a Catawba River bank at sunset', cap: 'A kayak on the Catawba River bank at sunset.' },
  crowders: { id: 'photo-1569599967822-03c72e9d1625', by: 'Evelyn Baylin', page: 'https://unsplash.com/photos/des7j7NR1FA', alt: 'A person sitting on a rock ledge above a forest at Crowders Mountain State Park', cap: 'The view at Crowders Mountain State Park, west of Gastonia.' },
  familypath: { id: 'photo-1781458677941-e7c3d3d1aabf', by: 'Barney Goodman', page: 'https://unsplash.com/photos/qOkFtXoQXAk', alt: 'A woman, a child and a dog walking along a leaf-strewn forest path', cap: 'A woman, a child and a dog on a leaf-strewn forest path.' },
  hikerdog: { id: 'photo-1778733844842-d977648d3779', by: 'Cas Medlin', page: 'https://unsplash.com/photos/KnZdlkvFC-w', alt: 'Two hikers and a dog walking on a forest path', cap: 'Two hikers and a dog on a forest path.' },
  woodlanddog: { id: 'photo-1789655468948-5047f00a7f03', by: 'Barney Goodman', page: 'https://unsplash.com/photos/FvHWvKp291w', alt: 'A small curly-haired dog on a sunlit woodland path with fallen branches', cap: 'A curly-haired dog on a sunlit woodland path.' },
  osprey:   { id: 'photo-1754440414637-c22ebe1593eb', by: 'Gray Clary', page: 'https://unsplash.com/photos/rpm0BfBLf1I', alt: 'An osprey sitting in its nest in the trees', cap: 'An osprey on its nest, photographed by a Rock Hill, SC photographer.' },
  rhroad:   { id: 'photo-1670176451089-36e448c5c51e', by: 'Karolina Bobek', page: 'https://unsplash.com/photos/DCmTUr-lExc', alt: 'A puppy walking on a tree-lined road on a morning walk in Rock Hill, SC', cap: 'A morning puppy walk in Rock Hill, SC.' },
  rhbench:  { id: 'photo-1674667493787-5d7078dfd07c', by: 'Karolina Bobek', page: 'https://unsplash.com/photos/WfM6p-HUltA', alt: 'A dog on a park path beside a bench in Rock Hill, SC', cap: 'A park path in Rock Hill, SC, the largest city in York County.' }
};
const src = (k, w, h) => `https://images.unsplash.com/${LIB[k].id}?auto=format&fit=crop&w=${w}${h ? '&h=' + h : ''}&q=75`;
module.exports = { LIB, src };

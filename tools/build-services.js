#!/usr/bin/env node
/*
 * Builds the service pages (services/*.html) and the services hub (services.html)
 * from the content below. Edit the content here, then run:
 *   node tools/build-services.js
 * and commit the generated HTML. The site itself has no build step.
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://porchlightpetcare.com';
const ROOT = path.join(__dirname, '..');
const img = (id, w, h) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}${h ? '&h=' + h : ''}&q=75`;
const PH = require('./town-photos.js');
const EXTRA_PHOTOS = { 'belmont': ['lake', 'kayak'], 'mt-holly': ['kayak'], 'lake-wylie': ['lake', 'osprey'], 'clover': ['rhbench'], 'york': ['rhroad'] };
const ORDER = ['belmont', 'mt-holly', 'cramerton', 'mcadenville', 'lake-wylie', 'east-gastonia', 'lowell', 'ranlo', 'clover', 'york', 'india-hook', 'newport'];
const TOWN_PAGES = require('./towns.js').concat(require('./towns2.js'))
  .map(t => {
    const o = { ...t, hero: typeof t.hero === 'function' ? t.hero(img) : t.hero, photos: t.photos || EXTRA_PHOTOS[t.slug] || [] };
    if (t.heroPhoto) { o.hero = PH.src(t.heroPhoto, 1200); o.heroAlt = PH.LIB[t.heroPhoto].alt; }
    return o;
  })
  .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
const SC_TOWNS = ['Lake Wylie', 'Clover', 'York', 'India Hook', 'Newport'];
const TOWNS = ['Belmont', 'Mt. Holly', 'Cramerton', 'McAdenville', 'Lake Wylie', 'East Gastonia', 'Lowell', 'Ranlo', 'Clover', 'York', 'India Hook', 'Newport'];

/* Small line icons (stroke uses currentColor). */
const ICONS = {
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 2-3M13 7c0-1.5 1-2 2-3"/>',
  ball: '<circle cx="12" cy="12" r="8"/><path d="M5 9c4 1 10 1 14 0M5 15c4-1 10-1 14 0"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="M9.5 8.5l5 7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  plant: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M7 21h10"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  leash: '<circle cx="6" cy="6" r="3"/><path d="M8 8c4 4 6 7 9 13"/><path d="M15 17l4 2"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-3 0-5 3-5 5.5 0 1.5 1.5 2 2.5 1.5s1.5-.5 2.5-.5 1.5 0 2.5.5 2.5 0 2.5-1.5C17 15 15 12 12 12z"/>',
  litter: '<path d="M3 11h18l-2 8H5z"/><path d="M8 11V8h8v3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  thermo: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  car: '<path d="M5 16l1.5-5h11L19 16"/><rect x="3" y="16" width="18" height="4" rx="1"/>'
};
const icon = (name, color) => `<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${color || '#14233B'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const tick = (color) => `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="${color}"/><path d="m6.5 11.4 3 3 6-6" stroke="${color === '#F2B33D' ? '#14233B' : '#fff'}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SERVICES = [
  {
    slug: 'overnight-pet-sitting', id: 'overnight', name: 'Overnight stays', short: 'Overnight stays',
    title: 'Overnight Pet Sitting in Belmont, NC',
    metaTitle: 'Overnight Pet Sitting in Belmont, NC | Porchlight Pet & Home Care',
    metaDesc: 'In-home overnight pet sitting in Belmont, Mt. Holly, Cramerton and Lake Wylie. Your sitter stays the night: evening and morning walks, meals, meds, playtime and photo updates. $95 a night.',
    h1: 'Overnight pet sitting, in your own home.',
    lede: 'Your sitter arrives in the evening and stays until morning, so your pets keep their own beds, their own yard and their own routine, and your house never sits empty.',
    price: 95, unit: 'per night',
    hero: '/assets/img/pack/oskar-eden-nap.jpg', heroAlt: 'Oskar the dachshund napping on top of Eden, curled up on a blanket',
    gallery: [
      ['/assets/img/pack/couch-pile.jpg', 'Maizy and Oskar piled together on the couch, with Bowie asleep in front'],
      ['/assets/img/pack/maizy-bedtime.jpg', 'Maizy asleep in bed, tucked under the covers'],
      ['/assets/img/pack/maizy-home-pillow.jpg', 'Maizy dozing in front of a pillow that reads Home is wherever']
    ],
    cta: 'Check overnight dates',
    included: [
      ['leash', 'Evening and morning walks', 'A proper walk at dusk and again first thing, at your dog’s pace and on their usual route.'],
      ['bowl', 'Dinner and breakfast', 'Meals measured exactly as you leave them, fresh water topped up, bowls washed.'],
      ['ball', 'Playtime', 'Fetch in the yard, tug, puzzle toys, or a good brush, whatever your pet loves.'],
      ['tv', 'Couch time and a movie', 'An evening on the sofa together, TV on low, so the house feels like a normal night.'],
      ['heart', 'Snuggles on request', 'Lap dogs get a lap. Cats who like their space get their space.'],
      ['book', 'A bedtime routine', 'Last potty break, the treat they always get, their blanket, a story read aloud if that’s what they’re used to. We follow your routine.'],
      ['pill', 'Medications on schedule', 'Pills, drops and injections given exactly when you say, logged so you can see it happened.'],
      ['mail', 'Home care included', 'Mail and packages in, trash out on trash night, lights on and off so the house looks lived in.'],
      ['camera', 'Evening and morning updates', 'A note and photos at night, another in the morning, in your client portal and by text.']
    ],
    timelineTitle: 'A typical overnight',
    timeline: [
      ['6:30 pm', 'Arrive and settle in', 'A calm hello, a look around, and a check that everything is as you left it.'],
      ['6:45 pm', 'Evening walk', 'Their usual loop, or a longer one if they have energy to spare.'],
      ['7:30 pm', 'Dinner and meds', 'Measured portions, medications, fresh water.'],
      ['8:00 pm', 'Play, then couch time', 'Toys, a brush, and a quiet evening together.'],
      ['9:30 pm', 'Evening update', 'Photos and a note sent to you.'],
      ['10:00 pm', 'Bedtime routine', 'Last potty break, the bedtime treat, lights out on your schedule.'],
      ['7:00 am', 'Morning walk and breakfast', 'Out first thing, then breakfast and morning meds.'],
      ['8:00 am', 'Tidy up and head out', 'Bed made, dishes done, morning photo sent, house locked.']
    ],
    needs: {
      title: 'What your sitter needs from you',
      sub: 'Set these out before you leave and the night runs smoothly.',
      items: [
        ['A clean bed with fresh sheets', 'A guest room or made-up couch is fine. Let us know which.'],
        ['Access to a bathroom and shower', 'Plus a clean towel, so your sitter can get ready in the morning.'],
        ['Enough food, treats and meds for the whole stay', 'With a day or two extra in case your flight is delayed.'],
        ['Wi-Fi name and password', 'So updates and photos reach you without a hitch.'],
        ['Your pet’s routine, written down', 'Meal times, amounts, bedtime ritual, where they sleep. The client portal has a place for all of it.'],
        ['A way in and a spare key', 'Lockbox or door code, plus a backup in case a battery dies.'],
        ['Your vet and an emergency contact', 'Already on file if you’ve filled out the new client form.']
      ]
    },
    brings: {
      title: 'What your sitter brings',
      sub: 'You don’t need to supply any of this.',
      items: [
        ['Their own toiletries', 'And a change of clothes. No need to stock anything extra.'],
        ['Poop bags and a pet first-aid kit', 'Always in the car, always restocked.'],
        ['A phone charger and a calm presence', 'Plus a strict no-guests, no-parties rule. It’s your home.']
      ]
    },
    pricing: [
      ['Overnight stay', 'About 6:30 pm to 8:00 am, one or two pets', '$95'],
      ['Each additional pet', 'Per night', '+$5'],
      ['Midday check-in during your trip', '30-minute visit on days you’re away', '$25'],
      ['Holidays', 'Thanksgiving, Christmas, New Year’s, July 4th and similar', '+$20']
    ],
    faq: [
      ['How many hours is an overnight?', 'Your sitter arrives around 6:30 pm and leaves around 8:00 am, roughly 13 hours. If your pets need a different window, tell us and we’ll match it.'],
      ['Is my pet left alone during the day?', 'An overnight covers evening to morning. For dogs who can’t be alone all day, add a midday walk or drop-in while you’re away.'],
      ['Will the sitter have guests over?', 'Never. No guests, no parties, no other pets brought along.'],
      ['Can you sleep where my dog sleeps?', 'Yes. If your dog sleeps in your bedroom, tell us whether you’d like your sitter there, on the couch nearby, or in the guest room.'],
      ['How far ahead should I book?', 'Two to three weeks for regular dates, and earlier for holidays, which fill first.']
    ]
  },
  {
    slug: 'dog-walking', id: 'walk', name: 'Dog walking', short: 'Dog walking',
    title: 'Dog Walking in Belmont, NC',
    metaTitle: 'Dog Walking in Belmont, NC | Porchlight Pet & Home Care',
    metaDesc: 'Private 30-minute dog walks in Belmont, Mt. Holly, Cramerton and Lake Wylie. One dog or household at a time, fresh water after, photo update every walk. Big dogs welcome. $30 a walk.',
    h1: 'Dog walks that fit your workday.',
    lede: 'A private 30-minute walk at your dog’s pace, with fresh water after and a photo so you know it happened. One household at a time, never a pack.',
    price: 30, unit: 'per 30-minute walk',
    hero: img('photo-1569992274375-e56b14e234f1', 1200), heroAlt: 'A man walking his dog along a tree-lined path',
    gallery: [
      ['/assets/img/pack/pack-hilltop.jpg', 'Bowie, Oskar, Eden and Maizy resting on leashes on a grassy hilltop after a hike'],
      ['/assets/img/pack/akita-uptown.jpg', 'Shamus on a walk in uptown Charlotte'],
      ['/assets/img/pack/eden-puppy.jpg', 'Eden as a puppy, bounding across the grass']
    ],
    cta: 'Book a walk',
    included: [
      ['leash', 'A private 30-minute walk', 'Just your dog (or your dogs together). No group walks, no strangers’ dogs.'],
      ['paw', 'Their pace, their route', 'Sniff walks for seniors, brisk loops for young dogs, your preferred route if you have one.'],
      ['water', 'Fresh water after', 'Bowl rinsed and refilled when we get back.'],
      ['bowl', 'A meal if it’s mealtime', 'Midday lunch or an afternoon snack, measured as you direct.'],
      ['shield', 'Safety first', 'Your leash and harness, double-checked clips, and we steer clear of loose dogs.'],
      ['camera', 'A photo and a note', 'How it went, how long, anything worth knowing, sent to your portal.']
    ],
    timelineTitle: 'How a walk goes',
    timeline: [
      ['Arrive', 'Hello and harness', 'Let ourselves in, a calm greeting, leash and harness on.'],
      ['5 min', 'Potty break first', 'A quick stop in the yard before heading out.'],
      ['25 min', 'The walk', 'Their usual loop or a new one, with time to sniff.'],
      ['Back home', 'Water, paws, treat', 'Muddy paws wiped, water refilled, the treat you approved.'],
      ['Before leaving', 'Update sent', 'A photo and a short note, then the door locked behind us.']
    ],
    needs: {
      title: 'Before the first walk',
      sub: 'We sort all of this out at the free meet-and-greet.',
      items: [
        ['Leash and harness by the door', 'The ones your dog is used to. We’ll check the fit.'],
        ['Treats and poop bags', 'We bring bags too, but your dog’s favorite treats help.'],
        ['A way in', 'Lockbox, door code, or a key on file.'],
        ['Any walking quirks', 'Pulls toward squirrels, scared of trucks, doesn’t like other dogs: tell us everything.']
      ]
    },
    brings: {
      title: 'Every walker carries',
      sub: 'On every walk, every time.',
      items: [
        ['Poop bags', 'And we always pick up.'],
        ['Water for hot days', 'A collapsible bowl for summer walks.'],
        ['Pet first-aid kit', 'In the car, restocked regularly.']
      ]
    },
    pricing: [
      ['30-minute walk', 'One dog, or two dogs from the same home walked together', '$30'],
      ['Each additional dog', 'Walked together', '+$5'],
      ['Holidays', 'Per walk', '+$10']
    ],
    faq: [
      ['Do you walk big or strong dogs?', 'Yes. Labs, shepherds, doodles, Danes and strong pullers are all welcome. We’ll talk through handling at the meet-and-greet.'],
      ['Will my dog be walked with other dogs?', 'No. Walks are private to your household.'],
      ['What if it’s raining or very hot?', 'We still come. In heavy rain or extreme heat the walk is shorter and the indoor play is longer, and we say so in the note.'],
      ['Can I book the same time every weekday?', 'Yes. Most walk clients have a standing midday slot. Book it once and it stays on the schedule.']
    ]
  },
  {
    slug: 'drop-in-visits', id: 'visit', name: 'Drop-in visits', short: 'Drop-in visits',
    title: 'Cat Sitting and Drop-In Pet Visits in Belmont, NC',
    metaTitle: 'Cat Sitting & Drop-In Pet Visits in Belmont, NC | Porchlight',
    metaDesc: 'In-home drop-in visits for cats, senior dogs and small pets in Belmont, Mt. Holly, Cramerton and Lake Wylie. Meals, litter, medication and real company. $25 per 30-minute visit.',
    h1: 'Drop-in visits for cats, seniors and homebodies.',
    lede: 'Thirty minutes of real care in your home: meals, litter, medication and company, for pets who are happiest staying put.',
    price: 25, unit: 'per 30-minute visit',
    hero: img('photo-1777660554959-658d19a195fa', 1200), heroAlt: 'A fluffy cat looking out of a window',
    gallery: [
      [img('photo-1607539678863-ba64f95124bc', 1200, 800), 'A cat waiting on a table for its food'],
      ['/assets/img/pack/oskar-window.jpg', 'Oskar on his window perch, watching for someone to come home'],
      ['/assets/img/pack/akita-cat.jpg', 'Shamus and Pepper the cat meeting nose to nose on the porch']
    ],
    cta: 'Book a visit',
    included: [
      ['bowl', 'Meals and fresh water', 'Wet food, dry food, special diets, all measured as you direct. Bowls washed.'],
      ['litter', 'Litter box scooped', 'Every visit. Full changes on longer trips if you’d like.'],
      ['pill', 'Medication given', 'Pills, liquids, eye drops and insulin, given exactly on schedule.'],
      ['ball', 'Playtime and company', 'Wand toys, laser time, a brush, or just sitting quietly with a shy cat.'],
      ['heart', 'A health check', 'Eating, drinking, litter output and mood, noted every visit so changes get caught early.'],
      ['camera', 'Photos and a note', 'Sent to your portal so you can see they’re fine.']
    ],
    timelineTitle: 'How a drop-in goes',
    timeline: [
      ['Arrive', 'Find everyone', 'Including the cat under the bed. We check on every pet.'],
      ['10 min', 'Meals, water and meds', 'Exactly as you’ve written it down.'],
      ['5 min', 'Litter and tidy', 'Scoop, sweep stray litter, wipe up any accidents.'],
      ['15 min', 'Play and company', 'On their terms.'],
      ['Before leaving', 'Update sent', 'Photo and note, then everything locked up.']
    ],
    needs: {
      title: 'Before the first visit',
      sub: 'We go over all of this at the free meet-and-greet.',
      items: [
        ['Food, treats and meds laid out', 'Enough for the whole trip, plus a little extra.'],
        ['Litter, scoop and bags', 'Where they live and where the used litter goes.'],
        ['Hiding spots and quirks', 'So we can find and check on shy pets without stressing them.'],
        ['A way in', 'Lockbox, door code, or a key on file.']
      ]
    },
    brings: {
      title: 'Good for',
      sub: 'Drop-ins work well when:',
      items: [
        ['Cats of any age', 'Most cats are far happier at home than boarded.'],
        ['Senior dogs', 'Who need a potty break and company more than a long walk.'],
        ['Small pets', 'Rabbits, guinea pigs, birds, fish and reptiles too.']
      ]
    },
    pricing: [
      ['30-minute visit', 'One or two pets', '$25'],
      ['Each additional pet', 'Per visit', '+$5'],
      ['Holidays', 'Per visit', '+$10']
    ],
    faq: [
      ['How many visits a day does my cat need?', 'Most cats do well with one visit a day. Twice a day is better for kittens, seniors, cats on medication, or trips longer than a few days.'],
      ['Can you give insulin or other injections?', 'Yes. We’ll go over dose, timing and storage at the meet-and-greet.'],
      ['What if my cat hides the whole time?', 'That’s normal. We still confirm they’re eating, drinking and using the box, and we’ll find them to lay eyes on them.'],
      ['Do you care for pets other than cats and dogs?', 'Yes: rabbits, guinea pigs, birds, fish and reptiles.']
    ]
  },
  {
    slug: 'home-check-ins', id: 'home', name: 'Home check-ins', short: 'Home check-ins',
    title: 'House Sitting and Home Check-Ins in Belmont, NC',
    metaTitle: 'House Sitting & Home Check-Ins in Belmont, NC | Porchlight',
    metaDesc: 'Home check-ins while you travel in Belmont, Mt. Holly, Cramerton and Lake Wylie. Mail and packages in, plants watered, lights rotated, a walk-through for leaks and problems. No pets needed. $30 a visit.',
    h1: 'Your house, looked after while you’re away.',
    lede: 'No pets required. We bring in the mail, water the plants, rotate the lights and walk through the house, so it looks lived in and nothing goes wrong unnoticed.',
    price: 30, unit: 'per visit',
    hero: img('photo-1605449669747-35d71b9436f8', 1200), heroAlt: 'Houseplants being watered',
    gallery: [
      [img('photo-1789352050543-b1bbc066fefc', 1200, 800), 'View from a covered front porch onto a quiet street'],
      [img('photo-1759693726718-10912942c0fb', 700, 700), 'A mailbox on a front door'],
      ['/assets/img/pack/eden-oskar-deck.jpg', 'Eden and Oskar on a back deck with planters of flowers']
    ],
    cta: 'Book a check-in',
    included: [
      ['mail', 'Mail and packages in', 'Nothing piling up on the porch telling people you’re gone.'],
      ['plant', 'Plants watered', 'Indoor and porch plants, on the schedule you set.'],
      ['bulb', 'Lights and blinds rotated', 'Different rooms on different days, so the house looks occupied.'],
      ['trash', 'Trash and recycling', 'Bins out on collection day and back in after.'],
      ['thermo', 'A walk-through', 'Every room checked for leaks, temperature problems, power outages and anything out of place.'],
      ['camera', 'A report every visit', 'Photos and a note, and a call right away if something needs attention.']
    ],
    timelineTitle: 'How a check-in goes',
    timeline: [
      ['Arrive', 'Outside first', 'A look at doors, windows and the yard. Packages and mail collected.'],
      ['10 min', 'Inside walk-through', 'Every room, the water heater, under sinks, the thermostat.'],
      ['10 min', 'Plants and lights', 'Water what’s due, change which lights and blinds are on.'],
      ['5 min', 'Trash and tidy', 'Bins on collection day, mail stacked where you want it.'],
      ['Before leaving', 'Report sent', 'Photos and a note, and the house locked up.']
    ],
    needs: {
      title: 'Before your trip',
      sub: 'A quick list so we can do the job right.',
      items: [
        ['Which plants, and how much water', 'A note or a photo of each one helps.'],
        ['Trash and recycling days', 'And where the bins live.'],
        ['Alarm code and company', 'So a check-in doesn’t become a police visit.'],
        ['Who to call for problems', 'Your plumber, HVAC company, or a neighbor with a key.']
      ]
    },
    brings: {
      title: 'Add it to pet care',
      sub: 'Already booking pet care?',
      items: [
        ['Overnight stays include this', 'Mail, trash, lights and plants are part of every overnight.'],
        ['Drop-ins and walks', 'Ask us to grab the mail or water a plant on the way out. Small extras are free.'],
        ['Longer trips', 'Two or three check-ins a week keep things running for a month away.']
      ]
    },
    pricing: [
      ['Home check-in', 'About 30 minutes', '$30'],
      ['Holidays', 'Per visit', '+$10']
    ],
    faq: [
      ['How often should someone check on my house?', 'Every two to three days for most trips. Daily if you get lots of packages or have plants that need it.'],
      ['What happens if you find a problem?', 'We call you right away, and with your permission call the contractor you listed. We send photos either way.'],
      ['Do I need pets to book this?', 'No. Plenty of clients book check-ins for an empty house.'],
      ['Can you start my car or run the faucets?', 'Yes. Small upkeep jobs like those are included; just tell us what you’d like done.']
    ]
  },
  {
    slug: 'pet-taxi', id: 'taxi', name: 'Pet taxi', short: 'Pet taxi',
    title: 'Pet Taxi in Belmont, NC',
    metaTitle: 'Pet Taxi in Belmont, NC | Rides to the Vet and Groomer | Porchlight',
    metaDesc: 'Pet taxi from homes in Belmont, Mt. Holly, Cramerton, Lake Wylie, Clover, York and nearby. A safe, secured ride to the vet, groomer or boarding, door to door, with a text at pickup and drop-off. From $30 one way and $40 round trip.',
    h1: 'A safe ride to the vet, the groomer or the kennel.',
    lede: 'Can’t get off work for the appointment? We pick your pet up at your door, ride them there secured and calm, hand them to the clinic, and bring them home, with a text at every step.',
    price: 30, unit: 'and up, metered by the mile',
    hero: '/assets/img/pack/maizy-car.jpg', heroAlt: 'Maizy riding in the car, watching the park go by through the window',
    gallery: [
      [img('photo-1703733565148-0a33aa10184e', 1200, 800), 'Two dogs sitting in a car, looking out the window'],
      [img('photo-1764343983275-f350e4d86361', 1200, 800), 'A dog peeking out of a car window'],
      [img('photo-1759340875613-75cb64d2c16d', 1200, 800), 'A dog with its head out of a car window on a sunny day']
    ],
    cta: 'Book a pet taxi',
    includesTitle: 'Every ride includes',
    included: [
      ['car', 'Door-to-door pickup', 'We collect your pet from your home and bring them back, so you don’t have to leave work or find a ride.'],
      ['shield', 'Always secured', 'Every pet rides in a crate or a harness clipped to the seat belt, never loose in the car.'],
      ['paw', 'A calm, careful hand-off', 'We walk your pet in, check them in at the clinic or groomer, and tell the staff who to call.'],
      ['heart', 'A calm ride', 'Windows up, air on, no rushing. Anxious passengers get extra time and a soft voice.'],
      ['clock', 'Round trips with waiting', 'Need them brought home after? Choose a round trip and we handle the way back too.'],
      ['camera', 'A text at every step', 'Picked up, dropped off, and back home safe, so you always know where your pet is.']
    ],
    timelineTitle: 'How a pet taxi ride goes',
    timeline: [
      ['Pickup', 'Hello and secure', 'A calm greeting, leash and harness or carrier checked, and your appointment details confirmed.'],
      ['Ride', 'Straight there', 'The direct route, with the heat or air on and your pet buckled in or crated.'],
      ['Arrive', 'Hand-off', 'We check your pet in with the clinic or groomer and leave your phone number.'],
      ['Return', 'Pick up again', 'On a round trip, we collect your pet when they’re ready and bring them home.'],
      ['Home', 'Safe and settled', 'Water, a quick potty break, and a text letting you know they’re back.']
    ],
    needs: {
      title: 'What we need from you',
      sub: 'Put these in the booking notes and the ride goes smoothly.',
      items: [
        ['The destination address', 'The vet, groomer or boarding facility, and the appointment time.'],
        ['A carrier, or a harness that fits', 'Cats and small pets travel in a carrier. Dogs in a crate or a harness we can clip in.'],
        ['A heads-up to the clinic', 'Tell them Porchlight is dropping off. Only you, or a contact you list, can approve treatment.'],
        ['Your pet’s paperwork', 'Vaccine records or forms the clinic needs, in a folder or an envelope.'],
        ['A phone that’s on', 'The vet may need to reach you, and so may we.']
      ]
    },
    brings: {
      title: 'What we bring',
      sub: 'You don’t need to supply any of this.',
      items: [
        ['Seat covers and towels', 'For mud, drool and nervous accidents.'],
        ['Water and a bowl', 'For the ride, and for the wait.'],
        ['Cleaning supplies and a first-aid kit', 'Always in the car, always restocked.']
      ]
    },
    pricing: [
      ['Pet taxi, one way', '$20 plus $2 a mile. You see the exact fare for your trip before you book', '$30', 'taxi', true],
      ['Pet taxi, round trip', '$20 plus $3 a mile for the whole trip. Cheaper per leg than two one-way rides, 10 minutes of waiting included', '$40', 'taxi_rt', true],
      ['Waiting at the vet or groomer', 'The first 10 minutes are free, then $10 for each 15 minutes', '$10'],
      ['A very long drive', 'Past about 150 miles it is a transport trip, quoted for you', 'Quoted']
    ],
    faq: [
      ['Which pets can ride?', 'Dogs, cats and small pets in a carrier. Tell us the breed and weight when you book so we can confirm they ride safely in our vehicle.'],
      ['Do you stay with my pet at the vet?', 'We check your pet in and hand them to the staff. On a round trip we come back for them when they’re ready. If we wait with your pet, the first 10 minutes are free and then it’s $10 for each 15 minutes. We don’t make medical decisions: you, or a contact you list, approve treatment.'],
      ['Who pays the vet or groomer?', 'You do, directly. We bring your pet and bring them home; we don’t pay for or collect for the clinic.'],
      ['What if the appointment runs long?', 'Text us. A short delay is part of a round trip. For long waits we’ll agree on the extra cost with you first.'],
      ['Can I book the same ride every week?', 'Yes. Weekly rides to a groomer, daycare or physical therapy can be booked as a repeating request.']
    ]
  },
  {
    slug: 'flight-companion', id: 'flight', quote: 'flight', name: 'Flight companion', short: 'Flight companion',
    title: 'Pet Flight Companion (Flight Nanny) Near Charlotte, NC',
    metaTitle: 'Pet Flight Companion (Flight Nanny) near Charlotte, NC | Porchlight',
    metaDesc: 'A flight companion travels with your small dog or cat in the airplane cabin, door to door. Quoted per trip. Serving Belmont, Mt. Holly and the Charlotte area.',
    h1: 'Your pet flies in the cabin, with someone who cares.',
    lede: 'A flight companion, sometimes called a flight nanny, flies with your small dog or cat in the passenger cabin, from your door to the person waiting at the other end. No cargo hold, and no flying alone.',
    price: null, unit: 'quoted for each trip',
    hero: img('photo-1774790479490-dbf0f3a7fb60', 1200), heroAlt: 'A small dog peeking out of a carrier bag',
    gallery: [
      [img('photo-1779638416594-c56bcb5c8682', 1200, 800), 'A small shaggy dog peeking out of a black carrier'],
      [img('photo-1593182440709-4b7b56482c55', 1200, 800), 'An airplane wing above the clouds'],
      [img('photo-1530469641172-8ac15d0a7d6a', 1200, 800), 'A view of an airplane wing from a window seat']
    ],
    cta: 'Request a flight quote',
    includesTitle: 'Every flight includes',
    included: [
      ['paw', 'One-on-one, start to finish', 'Your pet stays with their companion from pickup to hand-off. They’re never left in a terminal or a hold.'],
      ['shield', 'In the cabin, under the seat', 'Your pet rides in an airline-approved carrier at the companion’s feet, not as cargo.'],
      ['bowl', 'Water, comfort and potty breaks', 'Feeding, water and a pet relief break at layovers, plus a favorite blanket or toy for the ride.'],
      ['camera', 'Updates along the way', 'Photos, videos and check-in texts, so you can watch your pet get there.'],
      ['car', 'Door-to-airport rides', 'Pickup at your home and a hand-off at the destination are planned into your quote.'],
      ['book', 'Help with the paperwork', 'We walk you through the airline’s pet rules and the health documents you’ll need.']
    ],
    timelineTitle: 'How a flight goes',
    timeline: [
      ['Weeks before', 'Quote and plan', 'You send the details, we send a written quote and a checklist of the paperwork and carrier you’ll need.'],
      ['Day before', 'Final check', 'Confirm the flight, the carrier, the health certificate and who is meeting your pet.'],
      ['Departure', 'Pickup and check-in', 'We collect your pet, handle airline check-in, and go through security together.'],
      ['In flight', 'Cabin and layovers', 'Your pet stays under the seat, with a relief break and water at any layover.'],
      ['Arrival', 'Hand-off', 'Your pet goes to the person you named at the other end, and you get a photo and a text.']
    ],
    needs: {
      title: 'What you’ll need to have ready',
      sub: 'We’ll send a checklist with your quote. The common items:',
      items: [
        ['A pet that fits the cabin rules', 'Most airlines require the pet and carrier to weigh 20 lb or less and fit under the seat. Check your airline.'],
        ['An airline-approved carrier', 'With enough room and ventilation for your pet to turn around and lie down.'],
        ['A health certificate', 'For interstate travel, a Certificate of Veterinary Inspection from a licensed vet, usually within 10 days of travel.'],
        ['Current vaccinations', 'Records showing rabies and other required vaccines. A microchip is recommended.'],
        ['Medications and a familiar blanket', 'Plus any food and a small bag of treats.'],
        ['A named person at the destination', 'With a phone number, ready to meet your pet at the gate or curb.']
      ]
    },
    brings: {
      title: 'How the price works',
      sub: 'Every trip is different, so each one is quoted.',
      items: [
        ['A written quote up front', 'Covering pickup, the flight, layovers and drop-off, so there are no surprises.'],
        ['The airline’s pet fee is separate', 'You pay the airline directly. Your companion’s own ticket is also separate and shown in the quote.'],
        ['What changes the price', 'Distance, layovers, the number of pets, and any medical needs on the way.']
      ]
    },
    pricing: [
      ['Companion fee', 'Pickup, flight, layovers and hand-off. Priced for each trip.', 'Quoted'],
      ['Airline pet fee', 'Paid by you to the airline', 'At cost'],
      ['Companion’s ticket', 'Shown as its own line in your quote', 'At cost']
    ],
    faq: [
      ['Which pets can fly with a companion?', 'Small dogs and cats that fit in an airline-approved carrier under the seat. Larger pets can’t fly in the cabin, so ground transport is usually the better choice.'],
      ['Why is there no set price?', 'Distance, dates, layovers and airline fees change every trip. We give you a written quote with each part listed, so you can compare it with any other.'],
      ['What if my flight is delayed or canceled?', 'We’ll agree in writing, before you book, what happens and what it costs if plans change. Your pet is never left alone while we sort it out.'],
      ['Do you need the health certificate?', 'For interstate travel, airlines and states generally require a Certificate of Veterinary Inspection from a licensed vet. We’ll tell you what applies to your route.'],
      ['Can you fly my pet internationally?', 'Not at this time. International travel has more rules and paperwork than we can promise to handle well.']
    ]
  },
  {
    slug: 'pet-transport', id: 'transport', quote: 'transport', name: 'Pet transport', short: 'Pet transport',
    title: 'Long-Distance Pet Transport by Car from Belmont, NC',
    metaTitle: 'Long-Distance Pet Transport by Car from Belmont, NC | Porchlight',
    metaDesc: 'Door-to-door pet and puppy transport by car for moves, adoptions and long trips, with regular breaks and photo updates. Quoted by the trip. Based in Belmont, NC.',
    h1: 'Door to door by car, for moves and long trips.',
    lede: 'Moving, adopting a puppy from a rescue or breeder, or driving to a specialist hours away? We drive your pet there directly, with regular breaks and updates all the way.',
    price: null, unit: 'quoted by the trip',
    hero: img('photo-1759559790290-a3c6fce1d55f', 1200), heroAlt: 'A beagle with its ears blowing out of a car window',
    gallery: [
      [img('photo-1764387519679-4364d7c4e1f2', 1200, 800), 'A poodle mix looking out of a car window'],
      [img('photo-1781999514099-26926cd1bf72', 1200, 800), 'A dalmatian looking out of a black car window'],
      [img('photo-1703733565148-0a33aa10184e', 1200, 800), 'Two dogs sitting in a car, looking out the window']
    ],
    cta: 'Request a transport quote',
    includesTitle: 'Every trip includes',
    included: [
      ['car', 'A direct drive', 'From your door, or the rescue or breeder’s, straight to the destination. No hubs and no hand-offs between drivers.'],
      ['shield', 'Secured for the whole ride', 'In a crate or a harness clipped in, with a cover for the seat and the air on.'],
      ['water', 'Breaks every few hours', 'Water, a leash walk and a potty break at regular stops, more often for puppies and seniors.'],
      ['camera', 'Updates all the way', 'Photos and texts at each stop, and when we arrive.'],
      ['book', 'Paperwork in order', 'We’ll tell you which health records your route needs, and keep them with your pet.'],
      ['heart', 'A calm, careful handler', 'One person with your pet the whole way, who treats them the way you would.']
    ],
    timelineTitle: 'How a long-distance trip goes',
    timeline: [
      ['Request', 'Tell us the route', 'Where from, where to, when, and who is traveling. We reply with a written quote.'],
      ['Before', 'Records and a plan', 'We confirm the health papers your route needs and agree on pickup and drop-off times.'],
      ['Pickup', 'Meet and secure', 'We meet your pet, check the crate or harness, and confirm who will receive them.'],
      ['On the road', 'Steady driving, regular stops', 'Water, walks and updates at each break, with no long stretches alone in the car.'],
      ['Arrival', 'Hand-off', 'Your pet goes only to the person you named, and you get a photo and a text.']
    ],
    needs: {
      title: 'What you’ll need to have ready',
      sub: 'We’ll send a checklist with your quote. The common items:',
      items: [
        ['The route and dates', 'Start and end addresses, a pickup window, and how flexible you are.'],
        ['Your pet’s details', 'Species, breed, age and weight, and anything that affects a long ride, like motion sickness or anxiety.'],
        ['Health records', 'Current vaccinations including rabies. Many interstate trips also need a Certificate of Veterinary Inspection.'],
        ['A crate or harness that fits', 'We can use yours, so the crate smells like home.'],
        ['Food, medication and a comfort item', 'Enough for the trip, plus a day extra in case of delays.'],
        ['Someone to meet your pet', 'A named person with a phone number at the destination.']
      ]
    },
    brings: {
      title: 'How the price works',
      sub: 'Every trip is different, so each one is quoted.',
      items: [
        ['A written quote up front', 'Based on distance, the time on the road and tolls, so you know the cost before you commit.'],
        ['Longer trips may include an overnight', 'If a trip can’t be driven in a day, the quote will include the extra night.'],
        ['More than one pet?', 'Pets from the same household can travel together, which usually costs less than separate trips.']
      ]
    },
    pricing: [
      ['Transport fee', 'Mileage, time on the road and tolls. Priced for each trip.', 'Quoted'],
      ['Overnight stop on a long trip', 'Only if the drive needs one. Shown in your quote.', 'In the quote'],
      ['Additional pets', 'From the same household, on the same trip', 'In the quote']
    ],
    faq: [
      ['How far will you drive?', 'We’ll quote any trip we can drive safely and reliably. Longer routes are quoted with an overnight stop.'],
      ['Can you bring home a puppy from a breeder or rescue?', 'Yes. Puppies need to be old enough and vaccinated for travel under the rules of the states involved, and we’ll ask for their records before the trip.'],
      ['Will my pet ride with other clients’ animals?', 'Not unless you agree to it. Pets from the same household travel together.'],
      ['What health papers do I need?', 'It depends on the route. For many interstate trips, a Certificate of Veterinary Inspection from a licensed vet is required, plus current rabies vaccination. We’ll tell you what applies when we quote.'],
      ['How do I get a price?', 'Send a quote request with the route and dates. We’ll reply with a written price, usually within a day.']
    ]
  }
];

const PAY_LINE = 'Payment is due when you book: Venmo or Zelle with no fee, or card with a $5 processing fee. Cancel at least 24 hours ahead for a full refund.';

/* ---------- Shared chrome ---------- */
const head = (title, desc, canonical, extra, current) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
${extra || ''}<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 38 44'%3E%3Cpath d='M6 16 19 7l13 9z' fill='%2314233B'/%3E%3Crect x='9' y='16' width='20' height='21' rx='3' fill='%23F2B33D' stroke='%2314233B' stroke-width='2.5'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/services.css">
</head>
<body>
<header class="site-header"><div class="wrap">
<a class="brand" href="/" aria-label="Porchlight Pet and Home Care, home">
<svg aria-hidden="true" width="38" height="44" viewBox="0 0 38 44" fill="none"><path d="M19 2v5" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/><path d="M6 16 19 7l13 9z" fill="#14233B"/><rect x="9" y="16" width="20" height="21" rx="3" fill="#F2B33D" stroke="#14233B" stroke-width="2.5"/><path d="M19 22c2.6 2.6 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1-3.8 3.6-6.4z" fill="#FFFFFF"/><path d="M13 41h12" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/></svg>
<span class="brand-name"><b>Porchlight</b><span>Pet &amp; Home Care</span></span></a>
<nav class="nav" aria-label="Main">
<a href="/services"${current === 'services' ? ' aria-current="page"' : ''}>Services</a>
<a href="/about"${current === 'about' ? ' aria-current="page"' : ''}>About</a>
<a href="/#pricing">Pricing</a>
<a href="/#area">Service area</a>
<a href="/#faq">FAQ</a>
<a href="/portal">Client login</a>
<a class="btn btn-navy" href="/#booking">Book a visit</a>
</nav></div></header>
`;

const footer = () => `
<section class="closing"><div class="wrap">
<div style="max-width:640px;display:flex;flex-direction:column;gap:8px">
<h2 class="display">Heading out of town? We’ll leave the light on.</h2>
<p style="font-size:19px">New here? Start with the <a href="/intake">new client form</a> and a free meet-and-greet.</p>
</div>
<div class="cta-row"><a class="btn btn-navy" href="/#booking">Book a visit</a><a class="btn btn-ghost" href="tel:+14704243183">Call 470-424-3183</a></div>
</div></section>
<footer class="site-footer"><div class="wrap">
<div class="foot-cols">
<div style="max-width:340px"><p class="display" style="font-size:24px;color:#fff">Porchlight Pet &amp; Home Care</p><p style="margin-top:8px">Dog walking, pet sitting and home care in Belmont, NC and nearby.</p></div>
<div><h4>Services</h4>${SERVICES.map(s => `<a href="/services/${s.slug}">${s.short}</a>`).join('')}</div>
<div><h4>Areas</h4>${TOWN_PAGES.map(t => `<a href="/areas/${t.slug}">${t.name}, ${t.state}</a>`).join('')}</div>
<div><h4>Porchlight</h4><a href="/about">About Kraig</a><a href="/intake">New client form</a><a href="/portal">Client login</a></div>
<div><h4>Contact</h4><a href="tel:+14704243183">470-424-3183</a><a href="mailto:hello@porchlightpetcare.com">hello@porchlightpetcare.com</a><p style="padding:4px 0">Belmont, NC 28012</p></div>
</div>
<div class="foot-base"><p>© 2026 Porchlight Pet &amp; Home Care. Insured and bonded.</p><p>Photos from <a href="https://unsplash.com/?utm_source=porchlight&amp;utm_medium=referral">Unsplash</a></p></div>
</div></footer>
<script>
/* Keep prices in sync with the booking system. */
fetch('https://ngiwnyoxdcycwotxargm.supabase.co/rest/v1/porchlight_services?select=id,price_cents', { headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naXdueW94ZGN5Y3dvdHhhcmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjQzOTEsImV4cCI6MjA5NzMwMDM5MX0.qcK6CUQkMzxoCZ2Dk8682It2honSch-blEyDXZEt9dc' } })
  .then(function (r) { return r.ok ? r.json() : []; })
  .then(function (rows) { rows.forEach(function (s) { document.querySelectorAll('[data-price="' + s.id + '"]').forEach(function (n) { n.textContent = '$' + Math.round(s.price_cents / 100); }); }); })
  .catch(function () {});
</script>
</body>
</html>
`;

const business = {
  '@type': 'LocalBusiness', '@id': SITE + '/#business', name: 'Porchlight Pet & Home Care', url: SITE,
  address: { '@type': 'PostalAddress', addressLocality: 'Belmont', addressRegion: 'NC', postalCode: '28012', addressCountry: 'US' },
  areaServed: TOWNS.map(t => ({ '@type': 'City', name: t + (SC_TOWNS.includes(t) ? ', SC' : ', NC') })), priceRange: '$$', telephone: '+1-470-424-3183'
};
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>\n`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function servicePage(s) {
  const url = `${SITE}/services/${s.slug}`;
  const book = s.quote ? `/quote?type=${s.quote}` : `/?service=${s.id}#booking`;
  const schema = ld({
    '@context': 'https://schema.org', '@graph': [
      business,
      { '@type': 'Service', name: s.title, serviceType: s.name, provider: { '@id': SITE + '/#business' }, areaServed: business.areaServed,
        url, description: s.metaDesc, ...(s.quote ? {} : { offers: { '@type': 'Offer', price: String(s.price), priceCurrency: 'USD', description: s.unit } }) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Services', item: SITE + '/services' },
        { '@type': 'ListItem', position: 3, name: s.name, item: url }] },
      { '@type': 'FAQPage', mainEntity: s.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
    ]
  });
  const others = SERVICES.filter(o => o !== s);
  return head(esc(s.metaTitle), esc(s.metaDesc), url, `<meta property="og:image" content="${s.hero.startsWith('/') ? SITE + s.hero : s.hero}">\n` + schema, 'services') + `
<main>
<section class="svc-hero"><div class="wrap">
<div class="svc-hero-copy">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/services">Services</a></li><li aria-current="page">${s.name}</li></ol></nav>
<p class="eyebrow">${esc(s.title)}</p>
<h1 class="display">${esc(s.h1)}</h1>
<p class="lede">${esc(s.lede)}</p>
<p class="price-tag">${s.quote ? '<b>Custom quote</b>' : `<b data-price="${s.id}">$${s.price}</b>`}<span>${esc(s.unit)}</span></p>
<div class="cta-row"><a class="btn btn-amber" href="${book}">${esc(s.cta)}</a><a class="btn btn-ghost" href="#included">What’s included</a></div>
</div>
<div class="svc-hero-media"><img src="${s.hero}" alt="${esc(s.heroAlt)}" width="600" height="520" fetchpriority="high"></div>
</div></section>

<section class="section" id="included"><div class="wrap">
<div class="section-head"><p class="eyebrow">What’s included</p><h2 class="display">${s.includesTitle || `Every ${s.id === 'overnight' ? 'overnight' : s.id === 'walk' ? 'walk' : 'visit'} includes`}</h2></div>
<div class="included">
${s.included.map(([ic, t, d]) => `<article class="inc"><span class="ic">${icon(ic)}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('\n')}
</div>
</div></section>

<section class="section tint"><div class="wrap">
<div class="section-head"><p class="eyebrow">Hour by hour</p><h2 class="display">${esc(s.timelineTitle)}</h2></div>
<ol class="timeline">
${s.timeline.map(([t, h, p]) => `<li><span class="t">${esc(t)}</span><div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></li>`).join('\n')}
</ol>
<p class="lede" style="margin-top:12px;font-size:16px;color:var(--muted)">Times are a guide. We follow your pet’s routine, not ours.</p>
</div></section>

<section class="section"><div class="wrap">
<div class="gallery">
${s.gallery.map(([src, alt]) => `<img src="${src}" alt="${esc(alt)}" loading="lazy">`).join('\n')}
</div>
</div></section>

<section class="section tint"><div class="wrap">
<div class="two-lists">
<div class="checklist featured"><h3>${esc(s.needs.title)}</h3><p class="sub">${esc(s.needs.sub)}</p><ul>
${s.needs.items.map(([b, t]) => `<li>${tick('#F2B33D')}<div><b>${esc(b)}</b><span>${esc(t)}</span></div></li>`).join('\n')}
</ul></div>
<div class="checklist"><h3>${esc(s.brings.title)}</h3><p class="sub">${esc(s.brings.sub)}</p><ul>
${s.brings.items.map(([b, t]) => `<li>${tick('#14233B')}<div><b>${esc(b)}</b><span>${esc(t)}</span></div></li>`).join('\n')}
</ul></div>
</div>
</div></section>

<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">Pricing</p><h2 class="display">${s.quote ? 'How pricing works' : 'Simple, listed prices'}</h2></div>
<dl class="pricebox">
${s.pricing.map(([n, d, p, pid, starting], i) => `<div><dt><b>${esc(n)}</b><span>${esc(d)}</span></dt>` + (starting ? `<dd><small style="font-size:14px;font-weight:600">Starting at </small><span data-price="${pid}">${esc(p)}</span></dd></div>` : `<dd${pid ? ` data-price="${pid}"` : (i === 0 && !s.quote ? ` data-price="${s.id}"` : '')}>${esc(p)}</dd></div>`)).join('\n')}
</dl>
<p class="lede" style="margin-top:18px;font-size:16px;color:var(--muted)">${PAY_LINE}</p>
<div class="cta-row" style="margin-top:20px"><a class="btn btn-amber" href="${book}">${esc(s.cta)}</a></div>
</div></section>

<section class="section tint"><div class="wrap">
<div class="section-head"><p class="eyebrow">Questions</p><h2 class="display">About ${s.name.toLowerCase()}</h2></div>
<div class="faq-list">
${s.faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</div>
</div></section>

<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">More from Porchlight</p><h2 class="display">Other services</h2></div>
<div class="others">
${others.map(o => `<a class="other" href="/services/${o.slug}"><img src="${o.gallery[0][0].replace('w=1200&h=800', 'w=600&h=320')}" alt="" loading="lazy"><div><h3>${o.name}</h3><p>${o.quote ? 'Quoted ' + esc(o.unit.replace(/^quoted /, '')) : 'From $' + o.price + ' ' + esc(o.unit)}</p></div></a>`).join('\n')}
</div>
</div></section>
</main>
` + footer();
}


function areaPage(t) {
  const url = `${SITE}/areas/${t.slug}`;
  const loc = `${t.name}, ${t.state}`;
  const schema = ld({
    '@context': 'https://schema.org', '@graph': [
      business,
      { '@type': 'Service', name: `Pet sitting and dog walking in ${loc}`, serviceType: 'Pet sitting', provider: { '@id': SITE + '/#business' }, areaServed: { '@type': 'City', name: loc }, url },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Service area', item: SITE + '/#area' },
        { '@type': 'ListItem', position: 3, name: loc, item: url }] },
      { '@type': 'FAQPage', mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
    ]
  });
  const near = t.nearby.map(sl => TOWN_PAGES.find(x => x.slug === sl)).filter(Boolean);
  const heroSrc = t.hero.startsWith('http') ? t.hero : t.hero;
  return head(esc(t.metaTitle), esc(t.metaDesc), url, `<meta property="og:image" content="${heroSrc.startsWith('/') ? SITE + heroSrc : heroSrc}">\n` + schema, 'area') + `
<main>
<section class="svc-hero"><div class="wrap">
<div class="svc-hero-copy">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/#area">Service area</a></li><li aria-current="page">${esc(t.name)}</li></ol></nav>
<p class="eyebrow">${esc(loc)}${t.home ? ' · Home base' : ''}</p>
<h1 class="display">${esc(t.h1)}</h1>
<p class="lede">${esc(t.lede)}</p>
<div class="cta-row"><a class="btn btn-amber" href="/?town=${t.slug}#booking">Book a visit in ${esc(t.name)}</a><a class="btn btn-ghost" href="/?service=meet&amp;town=${t.slug}#booking">Free meet &amp; greet</a></div>
</div>
<div class="svc-hero-media"><img src="${heroSrc}" alt="${esc(t.heroAlt)}" width="600" height="520" fetchpriority="high"></div>
</div></section>

<section class="section"><div class="wrap area-grid">
<div class="area-copy">
<p class="eyebrow">Pet care in ${esc(t.name)}</p>
${t.intro.map(p => `<p>${esc(p)}</p>`).join('\n')}
</div>
<aside class="area-facts"><h2 class="display">${esc(t.name)} at a glance</h2>
<dl class="facts">
${t.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
</dl></aside>
</div></section>

<section class="section tint"><div class="wrap">
<div class="section-head"><p class="eyebrow">Local walks</p><h2 class="display">${esc(t.placesTitle)}</h2></div>
<div class="included">
${t.places.map(([n, d]) => `<article class="inc"><span class="ic">${icon('leash')}</span><h3>${esc(n)}</h3><p>${esc(d)}</p></article>`).join('\n')}
</div>
</div></section>

${t.photos.length ? `<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">Local flavor</p><h2 class="display">Around ${esc(t.name)}</h2></div>
<div class="local-photos">
${t.photos.map(k => `<figure><img src="${PH.src(k, 1000, 640)}" alt="${esc(PH.LIB[k].alt)}" loading="lazy" width="1000" height="640"><figcaption>${esc(PH.LIB[k].cap)} Photo by <a href="${PH.LIB[k].page}" rel="noopener">${esc(PH.LIB[k].by)}</a> on Unsplash.</figcaption></figure>`).join('\n')}
</div>
</div></section>
` : ''}
<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">What we do in ${esc(t.name)}</p><h2 class="display">Care that comes to your door</h2></div>
<div class="others">
${SERVICES.filter(o => !o.quote).map(o => `<a class="other" href="/services/${o.slug}"><img src="${o.gallery[0][0].replace('w=1200&h=800', 'w=600&h=320')}" alt="" loading="lazy"><div><h3>${o.name}</h3><p>From $${o.price} ${esc(o.unit)}</p></div></a>`).join('\n')}
</div>
<p class="lede" style="margin-top:18px;font-size:16px;color:var(--muted)">${PAY_LINE}</p>
</div></section>

<section class="section tint"><div class="wrap">
<div class="section-head"><p class="eyebrow">Questions</p><h2 class="display">About pet care in ${esc(t.name)}</h2></div>
<div class="faq-list">
${t.faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</div>
</div></section>

<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">Nearby</p><h2 class="display">Also serving</h2></div>
<p class="lede" style="font-size:18px">${near.map(n => `<a href="/areas/${n.slug}">${esc(n.name)}, ${n.state}</a>`).join(' · ')} · <a href="/#area">See the full service area</a></p>
<p class="lede" style="margin-top:22px;font-size:14px;color:var(--muted)">Sources for the local details on this page: ${t.sources.map(([n, u]) => `<a href="${u}" rel="noopener">${esc(n)}</a>`).join('; ')}. Park rules and hours change, so check before you go.${t.heroPhoto ? ` Header photo by <a href="${PH.LIB[t.heroPhoto].page}" rel="noopener">${esc(PH.LIB[t.heroPhoto].by)}</a> on Unsplash.` : ''}</p>
</div></section>
</main>
` + footer();
}

function hubPage() {
  const url = `${SITE}/services`;
  const desc = 'Overnight pet sitting, dog walking, drop-in visits, home check-ins, pet taxi, flight companions and pet transport in Belmont, Mt. Holly, Cramerton, McAdenville, Lowell, Ranlo, Clover, York and Lake Wylie, west of the Catawba River.';
  const schema = ld({ '@context': 'https://schema.org', '@graph': [business, { '@type': 'ItemList', itemListElement: SERVICES.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/services/${s.slug}`, name: s.title })) }] });
  return head('Pet Sitting &amp; Home Care Services in Belmont, NC | Porchlight', desc, url, schema, 'services') + `
<main>
<section class="svc-hero"><div class="wrap" style="padding-bottom:56px">
<div class="svc-hero-copy" style="flex-basis:100%">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">Services</li></ol></nav>
<h1 class="display">Pet sitting and home care in Belmont, NC.</h1>
<p class="lede" style="max-width:720px">Everything happens in your home, by one person you’ve met first. Pick a service to see exactly what’s included.</p>
</div></div></section>
<section class="section"><div class="wrap"><div class="hub">
${SERVICES.map(s => `<a href="/services/${s.slug}"><img src="${s.hero.replace('w=1200', 'w=800&h=480')}" alt="${esc(s.heroAlt)}" loading="lazy"><div class="b"><p class="eyebrow">${s.quote ? 'Quoted ' + esc(s.unit.replace(/^quoted /, '')) : `From <span data-price="${s.id}">$${s.price}</span> ${esc(s.unit)}`}</p><h2>${s.name}</h2><p>${esc(s.lede)}</p><span class="more">See what’s included →</span></div></a>`).join('\n')}
</div></div></section>
</main>
` + footer();
}

/* ---------- About page ----------
 * Written in Kraig's voice. Anything in [brackets] is a placeholder for him to fill in.
 * Swap the photo placeholder for a real photo of Kraig with a dog as soon as there is one. */
const ABOUT = {
  promises: [
    ['shield', 'Insured and bonded', 'Pet-care liability insurance and a bond, and I’m happy to show you the paperwork.'],
    ['heart', 'Pet first aid and CPR', '[Certification name and year, once completed.]'],
    ['camera', 'You’ll always know how it went', 'A note and photos after every visit, straight to your phone and your client portal.'],
    ['clock', 'I show up when I say I will', 'My booking calendar only offers times I can actually make, drive included.'],
    ['paw', 'Your routine, not mine', 'Same food, same walk, same bedtime ritual. Pets do best when nothing changes.'],
    ['mail', 'Your home, respected', 'No guests, no snooping, keys labeled with a code and never your address.']
  ],
  facts: [
    ['Home base', 'Belmont, NC'],
    ['Studied at', 'UNC Charlotte'],
    ['Before Porchlight', 'Banking and customer service, where the job was getting every detail right and being someone people could trust with their money'],
    ['Pets in my life', 'My dog Bowie, plus Oskar, Eden and Maizy, my mom and stepdad’s crew. Before them, Shamus, my first dog, and Pepper the cat'],
    ['Favorite walk in town', '[e.g. the River Street loop, or Stowe Park]'],
    ['Big dogs?', 'Love them. Strong pullers and all.']
  ]
};

const PACK = [
  ['bowie-chair', 'Bowie', 'My dog', 'Black and white, all legs, and the first to claim the comfy chair. Walk buddy and official taste-tester.', 'Bowie mid-yawn, sprawled across an armchair'],
  ['oskar-portrait', 'Oskar', 'Family dog', 'A dapple dachshund who runs the window-perch neighborhood watch.', 'Oskar the dachshund looking at the camera on a deck'],
  ['eden-portrait', 'Eden', 'Family dog', 'Red, sweet and built for long walks, then long naps with Oskar on top of her.', 'Eden, a red hound mix, looking out from a porch railing'],
  ['maizy-grin', 'Maizy', 'Family dog', 'Small, loud about it, and never under the covers alone if she can help it.', 'Maizy, a small black-and-tan dog, grinning at the camera'],
  ['akita-uptown', 'Shamus', 'In loving memory', 'My first dog, and later the family’s. Hiker, porch guardian, and Pepper the cat’s reluctant roommate.', 'Shamus sitting on a sidewalk in uptown Charlotte']
];

function aboutPage() {
  const url = `${SITE}/about`;
  const desc = 'Meet Kraig Harahus, the Belmont local behind Porchlight Pet & Home Care. Insured and bonded in-home pet sitting, dog walking and home check-ins in Belmont and nearby towns.';
  const schema = ld({ '@context': 'https://schema.org', '@graph': [
    business,
    { '@type': 'AboutPage', url, name: 'About Porchlight Pet & Home Care', about: { '@id': SITE + '/#business' } },
    { '@type': 'Person', name: 'Kraig Harahus', jobTitle: 'Owner and pet sitter', worksFor: { '@id': SITE + '/#business' },
      homeLocation: { '@type': 'Place', name: 'Belmont, NC' }, alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of North Carolina at Charlotte' } }
  ] });
  return head('About Kraig | Porchlight Pet &amp; Home Care, Belmont NC', esc(desc), url, schema, 'about') + `
<main>
<section class="svc-hero"><div class="wrap">
<div class="svc-hero-copy">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">About</li></ol></nav>
<p class="eyebrow">Meet your sitter</p>
<h1 class="display">Hi, I’m Kraig.</h1>
<p class="lede">I started Porchlight because leaving a pet behind shouldn’t feel like a gamble. When you’re away, I’m the one at your door: same face every time, someone you’ve met in person, who treats your home and your animals the way you would.</p>
<div class="cta-row"><a class="btn btn-amber" href="/intake">Set up a free meet-and-greet</a><a class="btn btn-ghost" href="/services">See services</a></div>
</div>
<div class="svc-hero-media">
<figure class="pack-hero"><img src="/assets/img/pack/kraig-bowie.jpg" alt="Kraig sitting at a table, scratching his dog Bowie under the chin" width="768" height="576" fetchpriority="high"><figcaption>Me and Bowie.</figcaption></figure>
</div>
</div>
</div></section>

<section class="section"><div class="wrap about-story">
<div class="section-head"><p class="eyebrow">Why Porchlight</p><h2 class="display">Someone home when you can’t be.</h2></div>
<div class="story">
<p>I grew up in a family that runs its own businesses, so I learned early that you build a reputation one promise at a time. Before Porchlight I worked in banking, where the whole job was getting the details exactly right and being someone people trusted with what mattered to them. Pet care turns out to be the same job.</p>
<p>The name comes from the porch light you leave on when someone’s coming home. That’s what I want Porchlight to feel like: the house isn’t empty, the dog got walked, the cat got her medicine on time, and you get a photo to prove it.</p>
<p>I live right here in Belmont, so I’m minutes away, not driving in from across Charlotte. I’m small on purpose. When Porchlight grows, every new sitter will be someone I’d trust with my own pets, and you’ll always meet them first.</p>
<p>My first dog was Shamus. When I left for college he stayed behind with my mom and Pete, and he became as much theirs as mine. He was part of every family hike, and he even shared the house with Pepper, my grandmother’s cat, without too much drama. Shamus is gone now, but he’s a big part of why I do this.</p>
<p>[Kraig: add a sentence or two in your own words about why you love animals, or a favorite memory of Shamus.]</p>
<figure class="story-photo"><img src="/assets/img/pack/family-hike-shamus.jpg" alt="Kraig with his mom Susan, his stepdad Pete and Shamus on a mountain hike" width="1024" height="768" loading="lazy"><figcaption>Mom, me, Pete and Shamus on one of our hikes.</figcaption></figure>
</div>
</div></section>


<section class="section tint"><div class="wrap">
<div class="section-head"><p class="eyebrow">Meet the pack</p><h2 class="display">The dogs I practice on every day</h2><p class="lede">Big and small, high-energy and couch-shaped. Between my dog and my family’s, I’ve handled just about every kind of walk, bedtime and mealtime routine.</p></div>
<div class="pack">
${PACK.map(([f, n, who, d, alt]) => `<figure class="pup"><img src="/assets/img/pack/${f}.jpg" alt="${esc(alt)}" loading="lazy" width="600" height="600"><figcaption><h3>${esc(n)}</h3><p class="who">${esc(who)}</p><p>${esc(d)}</p></figcaption></figure>`).join('\n')}
</div>
</div></section>

<section class="section"><div class="wrap">
<div class="section-head"><p class="eyebrow">My promises to you</p><h2 class="display">What you can count on</h2></div>
<div class="included">
${ABOUT.promises.map(([ic, t, d]) => `<article class="inc"><span class="ic">${icon(ic)}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('\n')}
</div>
</div></section>

<section class="section"><div class="wrap">
<div class="two-lists">
<div class="checklist"><h3>A few things about me</h3><p class="sub">The quick version.</p>
<dl class="facts">
${ABOUT.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
</dl></div>
<div class="checklist featured"><h3>How we start</h3><p class="sub">Every new client, every time.</p><ul>
<li>${tick('#F2B33D')}<div><b>Fill out the new client form</b><span>Ten minutes: your pets, your routine, how to get in.</span></div></li>
<li>${tick('#F2B33D')}<div><b>Free meet-and-greet at your home</b><span>Your pets meet me, I learn the routine, we sort out keys.</span></div></li>
<li>${tick('#F2B33D')}<div><b>Book online, any time</b><span>Pick a service and an open time. I confirm personally.</span></div></li>
<li>${tick('#F2B33D')}<div><b>Updates after every visit</b><span>Notes and photos in your client portal.</span></div></li>
</ul>
<div class="cta-row" style="margin-top:22px"><a class="btn btn-amber" href="/intake">Start the new client form</a></div>
</div>
</div>
</div></section>
</main>
` + footer();
}

fs.mkdirSync(path.join(ROOT, 'services'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'about.html'), aboutPage());
SERVICES.forEach(s => fs.writeFileSync(path.join(ROOT, 'services', s.slug + '.html'), servicePage(s)));
fs.mkdirSync(path.join(ROOT, 'areas'), { recursive: true });
TOWN_PAGES.forEach(t => fs.writeFileSync(path.join(ROOT, 'areas', t.slug + '.html'), areaPage(t)));
fs.writeFileSync(path.join(ROOT, 'services.html'), hubPage());

const pages = ['', '/services', '/about'].concat(SERVICES.map(s => '/services/' + s.slug), TOWN_PAGES.map(t => '/areas/' + t.slug), ['/quote', '/intake']);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(p => `  <url><loc>${SITE}${p || '/'}</loc></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nDisallow: /portal\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('Built', SERVICES.length, 'service pages, the hub, sitemap.xml and robots.txt');

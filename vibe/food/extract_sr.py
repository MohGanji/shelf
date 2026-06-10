import json, re

d = json.load(open('FoodData_Central_sr_legacy_food_json_2021-10-28.json'))
foods = d['SRLegacyFoods']

WANT = {
    'Protein': ('protein', 'g'),
    'Total lipid (fat)': ('fat', 'g'),
    'Carbohydrate, by difference': ('carbs', 'g'),
    'Fiber, total dietary': ('fiber', 'g'),
    'Sugars, total including NLEA': ('sugar', 'g'),
    'Fatty acids, total saturated': ('satfat', 'g'),
    'Sodium, Na': ('sodium', 'mg'),
    'Vitamin A, RAE': ('vitA', 'µg'),
    'Vitamin C, total ascorbic acid': ('vitC', 'mg'),
    'Vitamin D (D2 + D3)': ('vitD', 'µg'),
    'Vitamin E (alpha-tocopherol)': ('vitE', 'mg'),
    'Vitamin K (phylloquinone)': ('vitK', 'µg'),
    'Thiamin': ('vitB1', 'mg'),
    'Riboflavin': ('vitB2', 'mg'),
    'Niacin': ('vitB3', 'mg'),
    'Vitamin B-6': ('vitB6', 'mg'),
    'Folate, total': ('folate', 'µg'),
    'Vitamin B-12': ('vitB12', 'µg'),
    'Calcium, Ca': ('calcium', 'mg'),
    'Iron, Fe': ('iron', 'mg'),
    'Magnesium, Mg': ('magnesium', 'mg'),
    'Phosphorus, P': ('phosphorus', 'mg'),
    'Potassium, K': ('potassium', 'mg'),
    'Zinc, Zn': ('zinc', 'mg'),
    'Selenium, Se': ('selenium', 'µg'),
    'Copper, Cu': ('copper', 'mg'),
}

# category -> (slug, quota)
CATS = {
    'Vegetables and Vegetable Products': ('vegetable', 120),
    'Fruits and Fruit Juices': ('fruit', 85),
    'Dairy and Egg Products': ('dairy & eggs', 65),
    'Cereal Grains and Pasta': ('grains', 55),
    'Legumes and Legume Products': ('legumes', 50),
    'Nut and Seed Products': ('nuts & seeds', 45),
    'Beef Products': ('meat', 25),
    'Poultry Products': ('meat', 30),
    'Pork Products': ('meat', 20),
    'Lamb, Veal, and Game Products': ('meat', 15),
    'Sausages and Luncheon Meats': ('meat', 15),
    'Finfish and Shellfish Products': ('seafood', 55),
    'Fats and Oils': ('fats & oils', 30),
    'Spices and Herbs': ('herbs & spices', 45),
    'Sweets': ('sweets', 20),
    'Beverages': ('beverages', 20),
    'Baked Products': ('prepared', 25),
    'Soups, Sauces, and Gravies': ('prepared', 15),
    'Breakfast Cereals': ('grains', 8),
}

EXCLUDE = re.compile(
    r'babyfood|infant|toddler|USDA Commodity|school|institutional|imitation|'
    r'home prepared|restaurant|fast food|reduced calorie|low sodium|less sodium|'
    r'unprepared|reconstituted|dehydrated|industrial|formulated|fortified beverage|'
    r'lightly fluoridated|nonfortified|vitamin water|alcoholic', re.I)

BONUS = [
    (re.compile(r'\braw\b', re.I), 24),
    (re.compile(r'\bdry\b|\bdried\b', re.I), 10),
    (re.compile(r'\bcooked, boiled\b|\broasted\b|\bcooked\b', re.I), 8),
    (re.compile(r'\bwhole\b', re.I), 4),
    (re.compile(r'without salt', re.I), 6),
    (re.compile(r'with salt|salted|sweetened|canned|frozen|drained', re.I), -10),
    (re.compile(r'\boil\b', re.I), 6),  # within fats&oils, prefer plain oils
]

# guarantee everyday staples make the cut regardless of quota
MUST = [re.compile(p, re.I) for p in [
    r'^Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw$',
    r'^Chicken, broilers or fryers, thigh, meat only, raw$',
    r'^Turkey, whole, breast, meat only, raw$',
    r'^Egg, whole, raw, fresh$', r'^Milk, whole, 3.25%',
    r'^Rice, white, long-grain, regular, raw, unenriched$',
    r'^Rice, brown, long-grain, raw', r'^Oats \(',
    r'^Bread, whole-wheat, commercially prepared$',
    r'^Butter, without salt$', r'^Oil, olive, salad or cooking$',
    r'^Avocados, raw, all commercial varieties$',
    r'^Yogurt, Greek, plain, whole milk$', r'^Quinoa, uncooked$',
    r'^Honey$', r'^Chocolate, dark, 70-85% cacao solids$',
    r'^Pasta, dry, unenriched$', r'^Potatoes, flesh and skin, raw$',
    r'^Fish, salmon, Atlantic, farmed, raw$', r'^Fish, salmon, Atlantic, wild, raw$',
    r'^Fish, tuna, fresh, yellowfin, raw$', r'^Beef, ground, 85% lean meat / 15% fat, raw$',
]]

def rnd(v, unit):
    if v is None: return None
    if v == 0: return 0
    if unit == 'g': return round(v, 2)
    return round(v, 1) if v < 10 else round(v)

def extract(f, slug):
    item, kcal = {}, None
    for n in f['foodNutrients']:
        nut = n.get('nutrient', {})
        name, amt, unit = nut.get('name',''), n.get('amount'), nut.get('unitName','')
        if amt is None: continue
        if name == 'Energy' and unit == 'kcal':
            kcal = amt
        elif name in WANT:
            key, wunit = WANT[name]
            if unit == wunit and key not in item:
                item[key] = rnd(amt, wunit)
    if kcal is None: return None
    if 'protein' not in item or 'carbs' not in item or 'fat' not in item: return None
    name = re.sub(r"\s*\(Includes foods for USDA's Food Distribution Program\)", '', f['description'])
    return {'name': name, 'cat': slug, 'kcal': round(kcal), **item}

def score(name):
    s = 100 - len(name) * 0.6 - name.count(',') * 4
    for rx, b in BONUS:
        if rx.search(name): s += b
    return s

by_cat = {}
must_items = []
for f in foods:
    cat = f.get('foodCategory', {}).get('description', '')
    name = f['description']
    if any(rx.search(name) for rx in MUST):
        slug = CATS.get(cat, (None,))[0] or 'other'
        it = extract(f, slug)
        if it: must_items.append(it)
        continue
    if cat not in CATS or EXCLUDE.search(name): continue
    slug, quota = CATS[cat]
    by_cat.setdefault(cat, []).append((score(name), f, slug))

out = list(must_items)
seen = {i['name'] for i in out}
for cat, lst in by_cat.items():
    lst.sort(key=lambda x: -x[0])
    quota = CATS[cat][1]
    kept = 0
    for s, f, slug in lst:
        if kept >= quota: break
        it = extract(f, slug)
        if it and it['name'] not in seen:
            out.append(it); seen.add(it['name']); kept += 1

out.sort(key=lambda x: (x['cat'], x['name']))
print(len(out), 'items')

js = ('// Bundled ingredient dataset extracted from USDA FoodData Central, SR Legacy (2018/2021 release).\n'
      '// All values per 100 g. Units: kcal; macros g; sodium & minerals & vitC/vitE/vitB1/vitB2/vitB3/vitB6 mg; vitA/vitD/vitK/folate/vitB12/selenium µg.\n'
      'export const FOODS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
open('/Users/m0hammad/shelf/vibe/food/js/data.js', 'w').write(js)
# sanity: staples present?
for staple in ['Broccoli, raw','Bananas, raw','Lentils, raw','Chicken','Salmon','Spinach, raw','Almonds','Oats','Egg, whole, raw, fresh']:
    hits = [i['name'] for i in out if staple.lower() in i['name'].lower()][:3]
    print(staple, '->', hits)

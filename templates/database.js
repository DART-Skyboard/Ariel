// --- DART Nutrition Internal Ingredient Database ---
// This file contains a list of common grocery items with their estimated national average price and calorie information.
// Prices and calories are estimates and can vary by location, brand, and season.

const ingredientDatabase = {
    // Produce: Fruits
    'apple': { price: 0.80, calories: 95 }, // per medium fruit
    'banana': { price: 0.30, calories: 105 }, // per medium fruit
    'orange': { price: 0.70, calories: 62 }, // per medium fruit
    'grapes': { price: 3.50, calories: 69 }, // per cup
    'strawberries': { price: 4.00, calories: 49 }, // per cup
    'blueberries': { price: 4.50, calories: 85 }, // per cup
    'lemon': { price: 0.60, calories: 29 }, // per medium fruit
    'lime': { price: 0.50, calories: 20 }, // per medium fruit
    'avocado': { price: 1.80, calories: 320 }, // per medium fruit
    'peach': { price: 0.60, calories: 60 }, // per medium fruit
    'plum': { price: 0.50, calories: 30 }, // per medium fruit
    'pear': { price: 1.00, calories: 100 }, // per medium fruit
    'kiwi': { price: 0.70, calories: 45 }, // per item
    'mango': { price: 2.00, calories: 200 }, // per medium fruit
    'pineapple': { price: 3.50, calories: 85 }, // per cup diced
    'raspberry': { price: 4.50, calories: 64 }, // per cup
    'cherry': { price: 3.00, calories: 90 }, // per cup
    'apricot': { price: 0.90, calories: 50 }, // per medium fruit
    'papaya': { price: 1.50, calories: 43 }, // per cup cubed
    'dragon fruit': { price: 4.00, calories: 60 }, // per cup cubed
    'pomegranate': { price: 0.75, calories: 70 }, // per cup seeds
    'figs (fresh)': { price: 0.70, calories: 30 }, // per item
    'persimmon': { price: 1.00, calories: 120 }, // per medium fruit
    'star fruit (carambola)': { price: 1.50, calories: 30 }, // per cup sliced
    'guava': { price: 2.00, calories: 60 }, // per cup
    'passion fruit': { price: 1.00, calories: 17 }, // per item
    
    // Produce: Vegetables
    'carrot': { price: 0.25, calories: 41 }, // per medium carrot
    'broccoli': { price: 1.50, calories: 55 }, // per cup chopped
    'spinach': { price: 2.50, calories: 23 }, // per 100g
    'onion': { price: 0.80, calories: 40 }, // per medium onion
    'garlic': { price: 0.50, calories: 5 }, // per clove
    'potato': { price: 0.90, calories: 163 }, // per medium potato
    'sweet potato': { price: 1.20, calories: 180 }, // per medium potato
    'bell pepper': { price: 1.30, calories: 30 }, // per medium pepper
    'tomato': { price: 0.75, calories: 22 }, // per medium tomato
    'lettuce': { price: 2.00, calories: 5 }, // per cup shredded
    'cucumber': { price: 1.00, calories: 45 }, // per medium cucumber
    'mushrooms': { price: 2.50, calories: 22 }, // per 100g
    'zucchini': { price: 1.00, calories: 20 }, // per medium fruit
    'eggplant': { price: 1.50, calories: 25 }, // per 100g
    'asparagus': { price: 3.00, calories: 20 }, // per cup
    'cauliflower': { price: 2.50, calories: 25 }, // per cup florets
    'cabbage': { price: 1.00, calories: 22 }, // per cup shredded
    'kale': { price: 2.00, calories: 33 }, // per cup chopped
    'arugula': { price: 3.50, calories: 5 }, // per cup
    'celery': { price: 1.50, calories: 16 }, // per cup chopped
    'ginger': { price: 2.50, calories: 2 }, // per tsp grated
    'sweet corn': { price: 0.50, calories: 80 }, // per ear
    'bok choy': { price: 1.50, calories: 13 }, // per cup chopped
    'swiss chard': { price: 2.50, calories: 7 }, // per cup cooked
    'fennel': { price: 1.50, calories: 20 }, // per cup sliced
    'parsnip': { price: 1.50, calories: 90 }, // per cup cooked
    'rutabaga': { price: 1.00, calories: 55 }, // per cup cooked
    'jicama': { price: 1.00, calories: 40 }, // per cup sliced
    'edamame (shelled)': { price: 3.00, calories: 190 }, // per cup cooked
    'artichoke hearts (jarred)': { price: 4.00, calories: 40 }, // per 100g
    'hearts of palm': { price: 5.00, calories: 20 }, // per 100g
    'shiitake mushrooms': { price: 5.00, calories: 50 }, // per 100g
    'oyster mushrooms': { price: 4.00, calories: 30 }, // per 100g
    'beets': { price: 1.00, calories: 58 }, // per cup cooked
    'leeks': { price: 2.00, calories: 54 }, // per cup chopped
    
    // Produce: Herbs
    'parsley': { price: 1.00, calories: 1 }, // per bunch, ~1 cal/tbsp chopped
    'cilantro': { price: 1.00, calories: 1 }, // per bunch, ~1 cal/tbsp chopped
    'basil': { price: 1.50, calories: 1 }, // per bunch, ~1 cal/tbsp chopped
    'rosemary': { price: 1.50, calories: 5 }, // per bunch, ~5 cal/tbsp chopped
    'thyme': { price: 1.50, calories: 2 }, // per bunch, ~2 cal/tbsp chopped
    'mint': { price: 1.50, calories: 1 }, // per bunch, ~1 cal/tbsp chopped
    'dill': { price: 1.50, calories: 1 }, // per bunch, ~1 cal/tbsp chopped
    'chives': { price: 1.50, calories: 0 }, // per bunch, ~0 cal/tbsp chopped
    
    // Meat & Seafood (Lean Focus)
    'chicken breast': { price: 5.00, calories: 165 }, // per 100g
    'chicken thigh': { price: 3.50, calories: 210 }, // per 100g (skinless, boneless estimate)
    'ground chicken (93% lean)': { price: 4.80, calories: 120 }, // per 100g
    'ground turkey (93% lean)': { price: 4.50, calories: 115 }, // per 100g
    'ground beef (93% lean)': { price: 6.00, calories: 140 }, // per 100g
    'lean steak (e.g., sirloin)': { price: 10.00, calories: 180 }, // per 100g
    'pork tenderloin': { price: 6.00, calories: 115 }, // per 100g
    'salmon': { price: 10.00, calories: 208 }, // per 100g (healthy fats)
    'shrimp': { price: 9.00, calories: 85 }, // per 100g
    'canned tuna (in water)': { price: 1.50, calories: 99 }, // per can (drained)
    'cod': { price: 8.00, calories: 85 }, // per 100g
    'tilapia': { price: 6.00, calories: 100 }, // per 100g
    'halibut': { price: 12.00, calories: 110 }, // per 100g
    'scallops': { price: 15.00, calories: 90 }, // per 100g
    'mussels': { price: 6.00, calories: 70 }, // per 100g
    
    // Dairy & Eggs
    'whole milk': { price: 1.00, calories: 150 }, // per cup
    '2% milk': { price: 1.00, calories: 120 }, // per cup
    'skim milk': { price: 1.00, calories: 80 }, // per cup
    'cheddar cheese': { price: 1.00, calories: 110 }, // per oz
    'mozzarella cheese': { price: 0.70, calories: 75 }, // per oz (part-skim)
    'parmesan cheese': { price: 1.00, calories: 110 }, // per oz
    'feta cheese': { price: 0.70, calories: 75 }, // per oz
    'greek yogurt': { price: 1.20, calories: 100 }, // per container (plain, 5-6oz)
    'cottage cheese (low-fat)': { price: 3.00, calories: 90 }, // per cup
    'ricotta cheese (part-skim)': { price: 3.50, calories: 49 }, // per 1/2 cup
    'kefir': { price: 4.00, calories: 110 }, // per cup
    'goat cheese': { price: 5.00, calories: 90 }, // per oz
    'gouda cheese': { price: 8.00, calories: 110 }, // per oz
    'butter': { price: 0.50, calories: 102 }, // per tbsp
    'eggs': { price: 0.30, calories: 70 }, // per large egg
    'egg': { price: 0.30, calories: 70 }, // per large egg
    'almond milk': { price: 3.50, calories: 30 }, // per cup (unsweetened)
    'soy milk': { price: 3.00, calories: 80 }, // per cup (unsweetened)
    'oat milk': { price: 4.00, calories: 120 }, // per cup (original/sweetened)
    'coconut milk (beverage)': { price: 3.50, calories: 45 }, // per cup
    'cashew milk': { price: 4.00, calories: 25 }, // per cup (unsweetened)
    
    // Bakery & Grains
    'bread': { price: 0.40, calories: 80 }, // per slice (white/wheat)
    'whole grain toast': { price: 0.40, calories: 80 }, // per slice
    'sourdough bread': { price: 5.00, calories: 100 }, // per slice
    'rye bread': { price: 4.00, calories: 70 }, // per slice
    'gluten-free bread': { price: 6.00, calories: 100 }, // per slice
    'bagel': { price: 1.00, calories: 250 }, // per item
    'croissant': { price: 2.50, calories: 230 }, // per item
    'muffin': { price: 2.00, calories: 300 }, // per item
    'brown rice': { price: 0.50, calories: 215 }, // per cup cooked
    'white rice': { price: 0.40, calories: 205 }, // per cup cooked
    'quinoa': { price: 2.50, calories: 220 }, // per cup cooked
    'barley': { price: 3.00, calories: 190 }, // per cup cooked
    'farro': { price: 4.00, calories: 160 }, // per cup cooked
    'couscous': { price: 2.00, calories: 176 }, // per cup cooked
    'orzo': { price: 2.00, calories: 170 }, // per cup cooked
    'polenta/grits': { price: 3.00, calories: 140 }, // per cup cooked
    'pasta': { price: 0.80, calories: 200 }, // per serving (dry, generic)
    'whole wheat pasta': { price: 1.50, calories: 200 }, // per serving (dry)
    'brown rice pasta': { price: 4.00, calories: 200 }, // per serving (dry)
    'oats': { price: 0.30, calories: 150 }, // per serving (dry, rolled oats)
    
    // Pantry, Spices & Canned Goods
    'olive oil': { price: 0.50, calories: 120 }, // per tbsp
    'vegetable oil': { price: 0.30, calories: 120 }, // per tbsp
    'sesame oil': { price: 0.50, calories: 120 }, // per tbsp
    'flour': { price: 0.20, calories: 100 }, // per 1/4 cup (all-purpose)
    'almond flour': { price: 10.00, calories: 160 }, // per 1/4 cup
    'coconut flour': { price: 7.00, calories: 120 }, // per 1/4 cup
    'sugar': { price: 0.10, calories: 16 }, // per tsp
    'honey': { price: 4.00, calories: 52 }, // per tbsp
    'maple syrup': { price: 8.00, calories: 52 }, // per tbsp
    'agave nectar': { price: 5.00, calories: 50 }, // per tbsp
    'salt': { price: 0.01, calories: 0 }, // per tsp
    'black pepper': { price: 0.05, calories: 6 }, // per tsp
    'nutritional yeast': { price: 8.00, calories: 20 }, // per tbsp
    'balsamic vinegar': { price: 8.00, calories: 12 }, // per tbsp
    'red wine vinegar': { price: 4.00, calories: 3 }, // per tbsp
    'apple cider vinegar': { price: 4.00, calories: 3 }, // per tbsp
    'ketchup': { price: 2.00, calories: 10 }, // per tbsp
    'mustard': { price: 1.50, calories: 10 }, // per tbsp
    'mayonnaise': { price: 3.50, calories: 90 }, // per tbsp (regular)
    'peanut butter': { price: 0.75, calories: 190 }, // per 2 tbsp
    'black beans': { price: 1.00, calories: 220 }, // per can
    'chickpeas': { price: 1.20, calories: 269 }, // per can
    'kidney beans': { price: 1.20, calories: 225 }, // per can
    'tomato sauce': { price: 1.50, calories: 82 }, // per can
    'canned tuna (in oil)': { price: 1.50, calories: 184 }, // per can (drained) - *Note: 'in water' specified for lean option above*
    'canned sardines (in water)': { price: 2.00, calories: 150 }, // per can (drained)
    'canned anchovies (in oil)': { price: 3.00, calories: 15 }, // per anchovy
    'soy sauce (low sodium)': { price: 3.00, calories: 10 }, // per tbsp
    'tamari': { price: 5.00, calories: 10 }, // per tbsp
    'sriracha': { price: 3.00, calories: 5 }, // per tbsp
    'chicken broth': { price: 2.00, calories: 15 }, // per cup
    'vegetable broth': { price: 2.00, calories: 15 }, // per cup
    'beef broth': { price: 2.00, calories: 20 }, // per cup
    'walnuts': { price: 8.00, calories: 185 }, // per oz
    'pecans': { price: 9.00, calories: 200 }, // per oz
    'almonds': { price: 1.00, calories: 164 }, // per oz
    'pistachios (shelled)': { price: 10.00, calories: 160 }, // per oz
    'macadamia nuts': { price: 20.00, calories: 200 }, // per oz
    'sunflower seeds (shelled)': { price: 5.00, calories: 175 }, // per oz
    'pumpkin seeds (shelled)': { price: 8.00, calories: 160 }, // per oz
    'chia seeds': { price: 6.00, calories: 70 }, // per tbsp
    'flax seeds': { price: 4.00, calories: 55 }, // per tbsp
    'raisins': { price: 5.00, calories: 130 }, // per 1/4 cup
    'dried cranberries': { price: 6.00, calories: 130 }, // per 1/4 cup
    
    // Snacks
    'potato chips': { price: 1.50, calories: 160 }, // per oz
    'pretzels': { price: 3.00, calories: 110 }, // per oz
    'rice cakes (plain)': { price: 3.00, calories: 35 }, // per cake
    'popcorn kernels': { price: 3.00, calories: 30 }, // per cup popped (air-popped)
    'granola bars': { price: 3.50, calories: 100 }, // per bar
    'beef jerky (lean)': { price: 7.00, calories: 100 }, // per oz
    'trail mix': { price: 8.00, calories: 150 }, // per oz
    'dark chocolate (70% cocoa)': { price: 4.00, calories: 170 }, // per oz
    'fruit leathers (low sugar)': { price: 0.75, calories: 50 }, // per item
    
    // Beverages
    'orange juice': { price: 3.50, calories: 110 }, // per cup (100%)
    'apple juice': { price: 3.00, calories: 120 }, // per cup (100%)
    'coffee beans': { price: 10.00, calories: 2 }, // per cup brewed black (per lb estimated price)
    'tea bags': { price: 3.00, calories: 2 }, // per cup brewed black (per box estimated price)
    'green tea': { price: 4.00, calories: 2 }, // per cup brewed
    'black tea': { price: 4.00, calories: 2 }, // per cup brewed
    'herbal teas': { price: 4.00, calories: 0 }, // per cup brewed
    'sparkling water (plain/flavored)': { price: 1.00, calories: 0 }, // per can
    'kombucha': { price: 3.50, calories: 30 }, // per 8oz bottle
    'coconut water': { price: 2.50, calories: 60 }, // per 12oz
    'espresso beans': { price: 15.00, calories: 5 }, // per shot (brewed espresso)
};
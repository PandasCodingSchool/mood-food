"""New India-market dishes for the food graph (catalog v2).

Row: name|cuisine|category|diet|allergens|spice|price|kcal|meals|moods|adv|health|tier|sensory|protein|method|region

diet: v=vegetarian, vg=vegetarian+vegan, nv=non_veg (egg-centric dishes are nv: many
      Indian vegetarians exclude egg, so labelling them vegetarian would be unsafe)
allergens: d dairy, g gluten, e eggs, n nuts, s shellfish, y soy, - none
spice: m mild, md medium, h hot, vh very_hot      meals: b l d n (late night)
moods: c comfort, h happy, s stressed, sd sad, e energetic, cb celebratory, r romantic,
       n nostalgic, sk sick, a adventurous, rx relaxed, hl healthy, cd cold, rn rainy, hw hot_weather
tier: m main, s starter, c complimentary
sensory: 10 digits 0-9 — sweet salty sour spicy umami rich crunchy creamy warm heavy
"""

ROWS = """
Hyderabadi Mutton Biryani|indian|indulgent|nv|d|h|380|780|ld|cb,h,c|4|5|m|1626771198|mutton|dum|hyderabad
Lucknowi Chicken Biryani|indian|indulgent|nv|d|md|340|720|ld|cb,h,c|4|5|m|1615671198|chicken|dum|lucknow
Kolkata Chicken Biryani|indian|indulgent|nv|d,e|md|320|740|ld|n,c,h|4|5|m|2515671198|chicken|dum|kolkata
Kolkata Mutton Biryani|indian|indulgent|nv|d,e|md|380|780|ld|n,cb,c|4|5|m|2515771198|mutton|dum|kolkata
Veg Dum Biryani|indian|comfort_food|v|d|md|260|620|ld|c,h|3|6|m|1625561198|veg|dum|hyderabad
Paneer Biryani|indian|comfort_food|v|d|md|290|680|ld|c,h,cb|3|6|m|1625571198|paneer|dum|north
Egg Biryani|indian|comfort_food|nv|d,e|h|240|650|ld|c,h|3|6|m|1616661198|egg|dum|hyderabad
Prawn Biryani|indian|indulgent|nv|d,s|h|420|700|ld|cb,a|5|5.5|m|1626771198|prawn|dum|coastal
Chicken Dum Pukht Biryani|indian|indulgent|nv|d,n|md|420|780|ld|cb,r|6|5|m|2515681198|chicken|dum|lucknow
Ambur Biryani|indian|indulgent|nv|-|h|300|700|ld|cb,h|5|5|m|1636671198|chicken|dum|tamil_nadu
Donne Biryani|indian|indulgent|nv|-|h|280|680|ld|cb,a|6|5|m|1636671198|chicken|dum|karnataka
Thalassery Biryani|indian|indulgent|nv|d|md|340|720|ld|cb,a|6|5|m|2515671198|chicken|dum|kerala
Chicken Tikka Masala|indian|comfort_food|nv|d|md|340|560|ld|c,h,s|2|5.5|m|3535581797|chicken|curry|north
Kadai Chicken|indian|comfort_food|nv|d|h|330|520|ld|c,h|3|5.5|m|1636661297|chicken|curry|north
Chicken Korma|indian|indulgent|nv|d,n|m|350|600|ld|c,r,cb|3|5|m|3512580897|chicken|curry|mughlai
Mutton Rogan Josh|indian|indulgent|nv|d|h|420|620|ld|cb,c,cd|4|5|m|1626770398|mutton|curry|kashmir
Keema Matar|indian|comfort_food|nv|-|md|300|540|ld|c,n|3|6|m|1625660287|mutton|curry|north
Chicken Changezi|indian|indulgent|nv|d|md|360|640|ld|cb,c|5|5|m|2524680897|chicken|curry|old_delhi
Afghani Chicken|indian|snack|nv|d|m|360|480|dn|cb,r|4|6|m|1512572385|chicken|tandoor|north
Chicken Malai Tikka|indian|snack|nv|d|m|340|420|dn|h,cb|3|6.5|s|1512562385|chicken|tandoor|north
Chicken Reshmi Kebab|indian|snack|nv|d,n|m|360|400|dn|cb,h|4|6|s|1512572384|chicken|tandoor|north
Tangdi Kebab|indian|snack|nv|d|md|340|460|dn|h,cb|3|5.5|s|1535662285|chicken|tandoor|north
Fish Tikka|indian|snack|nv|d|md|380|380|dn|h,a|4|7|s|1535542284|fish|tandoor|north
Amritsari Fish Fry|indian|snack|nv|g|md|360|460|dn|h,n|4|5.5|s|1625557174|fish|fried|punjab
Awadhi Galouti Kebab|indian|snack|nv|d|md|420|420|dn|cb,r,a|6|5|s|1625780794|mutton|griddled|lucknow
Kakori Kebab|indian|snack|nv|d|md|440|420|dn|cb,r|7|5|s|1625770794|mutton|grilled|lucknow
Hara Bhara Kebab|indian|snack|v|-|md|220|300|dn|hl,h|3|7|s|1524344274|veg|griddled|north
Dahi Ke Kebab|indian|snack|v|d,g|m|260|340|dn|cb,r|5|5.5|s|1513467474|paneer|fried|lucknow
Paneer Butter Masala|indian|comfort_food|v|d|md|290|560|ld|c,h,s|2|5.5|m|3524480897|paneer|curry|north
Kadai Paneer|indian|comfort_food|v|d|h|280|520|ld|c,h|3|6|m|2636561286|paneer|curry|north
Shahi Paneer|indian|indulgent|v|d,n|m|300|600|ld|cb,c,r|3|5|m|3512480896|paneer|curry|mughlai
Malai Kofta|indian|indulgent|v|d,n|m|300|620|ld|cb,c,r|3|5|m|3512480897|paneer|curry|mughlai
Paneer Bhurji|indian|comfort_food|v|d|md|240|420|bld|c,h|2|6.5|m|1534460385|paneer|sauteed|north
Matar Paneer|indian|comfort_food|v|d|md|260|480|ld|c,n|2|6.5|m|2524460596|paneer|curry|north
Navratan Korma|indian|indulgent|v|d,n|m|280|520|ld|cb,c|4|5.5|m|4512470896|veg|curry|mughlai
Methi Malai Matar|indian|comfort_food|v|d,n|m|270|480|ld|c,r|5|6|m|3512470796|veg|curry|mughlai
Mushroom Masala|indian|comfort_food|v|d|md|260|380|ld|c,a|4|7|m|1535660396|veg|curry|north
Chana Masala|indian|comfort_food|vg|-|h|220|420|ld|c,h,n|2|7|m|1636450286|legumes|curry|north
Aloo Gobi|indian|light_meal|vg|-|md|200|300|ld|c,n,hl|2|7.5|m|1525341185|veg|sauteed|north
Baingan Bharta|indian|comfort_food|vg|-|md|210|280|ld|c,n|3|7.5|m|1525650385|veg|roasted|north
Bhindi Masala|indian|light_meal|vg|-|md|200|240|ld|n,hl|3|8|m|1525442184|veg|sauteed|north
Dal Tadka|indian|comfort_food|vg|-|md|190|340|ld|c,n,sk,s|1|8|m|0514440594|legumes|simmered|north
Mix Veg Curry|indian|light_meal|v|d|md|220|320|ld|hl,n|2|7.5|m|2524440485|veg|curry|north
Sarson Ka Saag with Makki Roti|indian|comfort_food|v|d|md|260|520|ld|n,c,cd|4|7.5|m|1524560497|veg|simmered|punjab
Kadhi Chawal|indian|comfort_food|v|d|md|200|460|ld|c,n,sk|2|7|m|1554340695|legumes|simmered|north
Dal Baati Churma|indian|indulgent|v|d,g|md|280|780|ld|n,cb,a|6|5|m|4524570698|legumes|baked|rajasthan
Laal Maas|indian|indulgent|nv|d|vh|440|620|ld|a,cb|7|5|m|1629770398|mutton|curry|rajasthan
Nihari|indian|indulgent|nv|g|h|420|680|bd|c,cd,a|6|5|m|1626880398|mutton|simmered|old_delhi
Chole Bhature|indian|indulgent|v|g,d|h|200|780|bl|c,h,n|2|4|m|1636574398|legumes|fried|punjab
Chicken Curry Rice Bowl|indian|comfort_food|nv|-|h|240|560|ld|c,h|2|6|m|1536660397|chicken|curry|north
Tandoori Roti|indian|comfort_food|vg|g|m|30|120|ld|c|1|7|c|0400233064|none|tandoor|north
Garlic Naan|indian|comfort_food|v|g,d|m|70|300|ld|c,h|1|5|c|1500563385|none|tandoor|north
Lachha Paratha|indian|comfort_food|v|g,d|m|60|280|ld|c|1|5|c|1500465375|none|griddled|north
Jeera Rice|indian|comfort_food|vg|-|m|140|320|ld|c|1|6.5|c|0500431174|none|steamed|north
Boondi Raita|indian|light_meal|v|d|m|80|140|ld|rx,hl|1|7|c|1430231503|none|raw|north
Gobi Paratha|indian|comfort_food|v|g,d|md|140|420|bl|c,n|2|6|m|1513464397|veg|griddled|punjab
Paneer Paratha|indian|comfort_food|v|g,d|md|160|460|bl|c,n,h|2|6|m|1513465397|paneer|griddled|punjab
Rajasthani Thali|indian|indulgent|v|d,g|md|380|950|ld|cb,a,n|5|5.5|m|3534561598|veg|mixed|rajasthan
North Indian Veg Thali|indian|comfort_food|v|d,g|md|300|850|ld|c,n,h|2|6|m|2524561597|veg|mixed|north
Chicken Thali|indian|comfort_food|nv|d,g|md|360|950|ld|c,h|2|5.5|m|1525661598|chicken|mixed|north
Gujarati Thali|indian|comfort_food|v|d,g|m|320|880|ld|n,c,cb|4|6|m|5534461597|veg|mixed|gujarat
Veg Pulao|indian|light_meal|v|d|m|180|420|ld|c,rx|2|6.5|m|1502440395|veg|steamed|north
Peas Pulao with Raita|indian|light_meal|v|d|m|200|460|ld|c,rx|2|6.5|m|1512441394|veg|steamed|north
Yakhni Pulao|indian|comfort_food|nv|d|m|380|620|ld|c,cd,cb|5|5.5|m|1512660898|mutton|dum|kashmir
Kashmiri Dum Aloo|indian|comfort_food|v|d|h|260|440|ld|c,a|5|6|m|1526560696|veg|curry|kashmir
Goshtaba|indian|indulgent|nv|d|md|480|640|ld|cb,a|8|5|m|1524670897|mutton|simmered|kashmir
Mysore Masala Dosa|indian|light_meal|v|d|h|170|420|bld|h,e,n|3|6.5|m|1535437284|veg|griddled|karnataka
Ghee Roast Dosa|indian|light_meal|v|d|m|160|440|bld|h,n|3|6|m|1513358184|none|griddled|karnataka
Rava Dosa|indian|light_meal|vg|-|md|150|360|bld|h,e|3|6.5|m|1524338174|veg|griddled|tamil_nadu
Set Dosa|indian|light_meal|vg|-|m|130|380|bl|c,rx|3|6.5|m|2513330483|none|griddled|karnataka
Egg Dosa|indian|light_meal|nv|e|md|150|420|bld|h,e|2|6|m|1534448274|egg|griddled|tamil_nadu
Medu Vada Sambar|indian|snack|vg|-|md|110|340|bl|n,c,rn|2|6|s|1544447474|legumes|fried|tamil_nadu
Uttapam|indian|light_meal|vg|-|md|150|380|bl|c,hl|3|7|m|1534333284|veg|griddled|tamil_nadu
Pongal|indian|comfort_food|v|d|m|140|420|b|c,sk,n|4|6.5|m|0502350795|legumes|simmered|tamil_nadu
Curd Rice|indian|light_meal|v|d|m|140|340|ld|rx,sk,hw|2|7.5|m|1430231602|none|raw|tamil_nadu
Lemon Rice|indian|light_meal|vg|n|md|140|380|ld|e,hw|3|7|m|0563333264|none|sauteed|karnataka
Bisi Bele Bath|indian|comfort_food|v|d|md|170|460|ld|c,n,rn|5|6.5|m|1544450596|legumes|simmered|karnataka
Rasam Rice|indian|light_meal|vg|-|h|140|340|ld|sk,c,cd,rn|3|7.5|m|0573420191|legumes|simmered|tamil_nadu
Mini Idli with Ghee Podi|indian|light_meal|v|d|md|130|300|bl|h,rx|3|6.5|s|1513440474|legumes|steamed|tamil_nadu
Ragi Mudde with Saaru|indian|light_meal|vg|-|md|160|360|ld|hl,n|7|8|m|0534430395|legumes|steamed|karnataka
Chettinad Chicken Curry|indian|indulgent|nv|-|vh|360|560|ld|a,cd,cb|6|5.5|m|1628761397|chicken|curry|chettinad
Kerala Fish Curry|indian|comfort_food|nv|-|h|380|460|ld|a,h|5|7|m|1565761595|fish|curry|kerala
Malabar Parotta with Chicken Curry|indian|indulgent|nv|g,d|h|260|780|dn|c,cb|4|4.5|m|1626774497|chicken|curry|kerala
Appam with Veg Stew|indian|comfort_food|vg|-|m|200|480|bd|c,rx,n|5|6.5|m|3512351795|veg|simmered|kerala
Kerala Chicken Stew with Appam|indian|comfort_food|nv|-|m|320|520|bd|c,rx,n|5|6.5|m|2512461795|chicken|simmered|kerala
Chicken Ularthiyathu|indian|indulgent|nv|-|h|360|520|ld|a|6|5.5|m|1626762285|chicken|sauteed|kerala
Karimeen Pollichathu|indian|indulgent|nv|-|h|520|420|ld|a,cb|8|7|m|1556661385|fish|steamed|kerala
Puttu Kadala|indian|light_meal|vg|-|md|140|420|b|n,hl|6|7.5|m|1524440395|legumes|steamed|kerala
Idiyappam with Egg Curry|indian|comfort_food|nv|e|md|180|440|bd|c,n|5|6.5|m|1535550395|egg|steamed|kerala
Neer Dosa with Chicken Sukka|indian|comfort_food|nv|-|h|300|520|ld|a,h|6|6.5|m|1526662385|chicken|sauteed|mangalore
Mangalorean Prawn Ghee Roast|indian|indulgent|nv|s,d|vh|460|520|ld|a,cb|7|5|m|1639782385|prawn|sauteed|mangalore
Chicken 65|indian|snack|nv|e|h|280|480|dn|h,cb,e|3|4.5|s|1636667185|chicken|fried|tamil_nadu
Gobi 65|indian|snack|v|g|h|220|420|dn|h,e|3|5|s|1636557175|veg|fried|tamil_nadu
Andhra Chilli Chicken|indian|indulgent|nv|-|vh|320|520|dn|a,e|6|5|m|1639764185|chicken|stir_fried|andhra
Gongura Mutton|indian|indulgent|nv|-|vh|420|600|ld|a,cb|7|5|m|1679770397|mutton|curry|andhra
Hyderabadi Haleem|indian|indulgent|nv|g,d|h|380|700|dn|cb,c,cd|6|5|m|1615890798|mutton|simmered|hyderabad
Goan Fish Curry Rice|indian|comfort_food|nv|-|h|380|560|ld|a,h,hw|5|7|m|2665661595|fish|curry|goa
Prawn Balchao|indian|indulgent|nv|s|vh|440|420|ld|a|7|6|m|2679660385|prawn|sauteed|goa
Chicken Xacuti|indian|indulgent|nv|n|h|380|560|ld|a,cd|7|5.5|m|1526770597|chicken|curry|goa
Malvani Chicken|indian|indulgent|nv|-|vh|360|540|ld|a,cd|6|5.5|m|1628771297|chicken|curry|konkan
Kolhapuri Chicken|indian|indulgent|nv|-|vh|340|540|ld|a,e|6|5.5|m|1629761297|chicken|curry|maharashtra
Bombil Fry|indian|snack|nv|-|h|320|380|ld|a,n|7|6|s|1635548174|fish|fried|mumbai
Surmai Fry Thali|indian|indulgent|nv|-|h|480|720|ld|cb,a|6|6.5|m|1635658287|fish|fried|konkan
Kosha Mangsho|indian|indulgent|nv|-|h|420|620|ld|cb,c|6|5|m|2626770398|mutton|curry|bengal
Shorshe Ilish|indian|indulgent|nv|-|h|520|480|ld|a,cb,n|8|6.5|m|1645770395|fish|curry|bengal
Chingri Malai Curry|indian|indulgent|nv|s,d|m|480|520|ld|cb,r|6|5.5|m|4513670896|prawn|curry|bengal
Macher Jhol|indian|comfort_food|nv|-|md|320|380|ld|n,c,sk|5|7.5|m|1544650494|fish|curry|bengal
Luchi Alur Dom|indian|comfort_food|vg|g|md|160|560|b|n,c|4|4.5|m|2524456496|veg|fried|bengal
Parsi Dhansak|indian|comfort_food|nv|-|md|380|560|ld|n,a,c|7|6.5|m|3545660497|mutton|simmered|parsi
Salli Boti|indian|indulgent|nv|-|md|420|620|ld|cb,a|7|4.5|m|4535675397|mutton|curry|parsi
Patra ni Machhi|indian|light_meal|nv|-|md|420|360|ld|a,r|8|7.5|m|2555641293|fish|steamed|parsi
Bihari Chicken Curry|indian|comfort_food|nv|-|h|300|520|ld|c,a|6|6|m|1636660397|chicken|curry|bihar
Champaran Mutton|indian|indulgent|nv|-|h|480|680|ld|cb,a|7|5|m|1626771398|mutton|curry|bihar
Litti Chokha|indian|comfort_food|vg|g|md|140|480|ld|n,a|6|6|m|1524450575|legumes|baked|bihar
Naga Smoked Chicken|indian|indulgent|nv|-|vh|380|480|ld|a|9|6|m|1639860285|chicken|smoked|nagaland
Assamese Fish Tenga|indian|light_meal|nv|-|md|340|340|ld|a,hw|8|7.5|m|1574550192|fish|simmered|assam
Jadoh|indian|comfort_food|nv|-|md|300|540|ld|a,c|9|6|m|1525650496|chicken|simmered|meghalaya
Bamboo Shoot Chicken|indian|comfort_food|nv|-|h|340|460|ld|a|9|6.5|m|1556650394|chicken|simmered|north_east
Thukpa|indian|comfort_food|nv|g|md|220|420|ld|c,cd,rn,sk|5|7|m|1624740193|chicken|simmered|north_east
Undhiyu|indian|comfort_food|vg|n|md|260|420|ld|n,cd|7|7.5|m|3524550395|veg|simmered|gujarat
Mutton Kheema Pav|indian|street_food|nv|g|h|200|560|dn|c,a|4|5|m|1636671397|mutton|sauteed|mumbai
Vada Pav|indian|street_food|vg|g|h|50|300|bln|h,e,n|2|4.5|m|1645446364|veg|fried|mumbai
Misal Pav|indian|street_food|vg|g|vh|110|480|bl|a,e,cd|5|6|m|1659545496|legumes|simmered|maharashtra
Pani Puri|indian|street_food|vg|g|h|60|220|ln|h,e,hw|2|5|s|4785338002|veg|raw|north
Sev Puri|indian|street_food|vg|g|md|80|260|ln|h,e|2|5|s|5675338102|veg|raw|mumbai
Dahi Puri|indian|street_food|v|g,d|md|90|280|ln|h,rx,hw|2|5.5|s|5655338512|veg|raw|mumbai
Bhel Puri|indian|street_food|vg|g,n|md|70|240|ln|h,e|2|6|s|4775337001|veg|raw|mumbai
Samosa|indian|snack|vg|g|md|40|260|ln|n,c,rn|1|4|s|1534356475|veg|fried|north
Kachori|indian|snack|vg|g|h|50|300|bl|n,rn|2|4|s|1535457474|legumes|fried|rajasthan
Aloo Tikki Chaat|indian|street_food|v|d,g|h|90|340|ln|h,n|2|5|s|4675457463|veg|fried|delhi
Dabeli|indian|street_food|v|g,n,d|h|60|320|ln|h,a|4|4.5|m|4545446465|veg|griddled|gujarat
Onion Bhaji|indian|snack|vg|-|md|90|300|ln|c,rn,n|2|4.5|s|1534358274|veg|fried|maharashtra
Mirchi Bajji|indian|snack|vg|-|vh|80|260|ln|a,rn|4|4.5|s|1537458264|veg|fried|andhra
Paneer Pakora|indian|snack|v|d|md|160|380|ln|c,rn|2|5|s|1524457374|paneer|fried|north
Chicken Momos|indian|snack|nv|g|h|170|360|lnd|h,c,rn|2|5.5|s|1625642284|chicken|steamed|north_east
Fried Momos|indian|snack|v|g|h|160|420|lnd|h,e|2|4|s|1525546274|veg|fried|north_east
Tandoori Momos|indian|snack|v|g,d|h|190|420|dn|h,a|4|4.5|s|1545564374|veg|tandoor|delhi
Dhokla|indian|snack|vg|-|m|90|220|bl|hl,rx,hw|3|7.5|s|3542220453|legumes|steamed|gujarat
Khandvi|indian|snack|v|d|m|110|220|bl|hl,rx|5|7|s|2541230502|legumes|steamed|gujarat
Khaman|indian|snack|vg|-|m|80|200|bl|hl,h|3|7.5|s|4542230453|legumes|steamed|gujarat
Bombay Sandwich|indian|street_food|v|g,d|md|90|340|bln|h,n|2|6|m|1544246333|veg|raw|mumbai
Masala Corn Cup|indian|snack|v|d|md|70|200|ln|h,rn|2|6.5|s|3533344373|veg|sauteed|street
Chicken Seekh Roll|indian|street_food|nv|g,d|h|180|480|lnd|h,e|3|5.5|m|1636653386|chicken|tandoor|kolkata
Paneer Kathi Roll|indian|street_food|v|g,d|md|170|460|lnd|h,e|3|6|m|1535453375|paneer|griddled|kolkata
Egg Roll|indian|street_food|nv|g,e|md|120|420|lnd|h,n,e|2|5.5|m|1635544375|egg|griddled|kolkata
Kathi Chicken Tikka Wrap|indian|street_food|nv|g,d|h|210|520|lnd|h,e|3|5.5|m|1636653376|chicken|tandoor|delhi
Butter Chicken Roll|indian|street_food|nv|g,d|md|190|520|dn|c,h|2|4.5|m|3524573486|chicken|griddled|delhi
Paneer Tikka Roll|indian|street_food|v|g,d|h|170|480|dn|h,e|3|5|m|1635454375|paneer|tandoor|delhi
Chicken Frankie|indian|street_food|nv|g,e|h|160|480|lnd|h,e,n|3|5|m|1636554375|chicken|griddled|mumbai
Maggi Masala Noodles|indian|comfort_food|v|g|md|80|380|bln|n,c,rn,s|1|3|m|1715541384|none|simmered|india
Cheese Maggi|indian|comfort_food|v|g,d|md|110|460|bln|n,c,rn|1|3|m|1715661585|cheese|simmered|india
Egg Maggi|indian|comfort_food|nv|g,e|md|110|440|n|n,c|1|3.5|m|1715551385|egg|simmered|india
Bread Omelette|indian|street_food|nv|g,e|md|80|380|bn|n,e,h|1|5.5|m|1625452374|egg|griddled|india
Bun Omelette|indian|street_food|nv|g,e,d|md|90|380|bn|n,c|2|5|m|1625451375|egg|griddled|india
Egg Bhurji Pav|indian|street_food|nv|g,e,d|md|120|440|bdn|c,n,e|2|5.5|m|1525561385|egg|sauteed|mumbai
Anda Curry|indian|comfort_food|nv|e|h|200|420|ld|c,h|2|6.5|m|1636660396|egg|curry|north
Bun Maska|indian|snack|v|g,d|m|60|320|bn|n,rx|2|3.5|s|4400060574|none|baked|mumbai
Ghugni|indian|snack|vg|-|md|90|300|ln|n,c|4|7|s|1544440495|legumes|simmered|kolkata
Chicken Keema Paratha|indian|comfort_food|nv|g,d|h|180|560|dn|c,n|3|4.5|m|1626664387|chicken|griddled|north
Sabudana Vada|indian|snack|v|n|m|90|320|bl|n,c|3|4.5|s|1523357364|veg|fried|maharashtra
Aloo Puri|indian|comfort_food|vg|g|md|120|560|b|n,c,h|2|4.5|m|1524456496|veg|fried|north
Poori Bhaji|indian|comfort_food|vg|g|md|120|520|b|n,c|2|4.5|m|1524445596|veg|fried|maharashtra
Sabudana Khichdi|indian|light_meal|v|n|m|120|420|b|n,rx|3|6|m|1513452474|veg|sauteed|maharashtra
Thepla with Chhunda|indian|light_meal|v|g,d|m|120|380|bl|n,rx|4|6.5|m|4523340364|veg|griddled|gujarat
Methi Paratha with Curd|indian|light_meal|v|g,d|md|140|380|bl|hl,n|3|7|m|1523351474|veg|griddled|north
Masala Omelette|indian|light_meal|nv|e|md|110|300|bln|e,h|1|7|m|0525440274|egg|griddled|india
Akuri on Toast|indian|light_meal|nv|e,g,d|md|180|380|b|n,c,rx|5|6.5|m|1525561374|egg|sauteed|parsi
Moong Dal Chilla|indian|light_meal|vg|-|md|130|280|b|hl,e|4|8|m|0524331274|legumes|griddled|north
Besan Chilla|indian|light_meal|vg|-|md|110|260|b|hl,n|3|7.5|m|0524332274|legumes|griddled|north
Vermicelli Upma|indian|light_meal|vg|g|m|110|340|b|rx,n|3|6.5|m|1512331374|veg|sauteed|south
Paneer Sandwich|indian|light_meal|v|g,d|m|140|380|bl|h,rx|2|6|m|1513345354|paneer|toasted|india
Ragi Dosa|indian|light_meal|vg|-|md|150|280|b|hl|5|8|m|0524336173|legumes|griddled|healthy
Oats Idli|indian|light_meal|vg|-|m|140|240|b|hl,rx|4|8.5|s|1532320372|legumes|steamed|healthy
Gulab Jamun|indian|dessert|v|d,g|m|80|300|ldn|cb,h,n|1|3|s|9100170785|none|fried|india
Rasmalai|indian|dessert|v|d,n|m|120|260|ldn|cb,r,n|2|4|s|8100150902|none|chilled|bengal
Rasgulla|indian|dessert|v|d|m|80|190|ldn|cb,h|2|4.5|s|9000030602|none|simmered|bengal
Mishti Doi|indian|dessert|v|d|m|80|200|ldn|n,rx|3|5|s|8130160801|none|chilled|bengal
Sandesh|indian|dessert|v|d|m|90|180|ldn|cb,h|3|5|s|8100140501|none|cooked|bengal
Gajar Ka Halwa|indian|dessert|v|d,n|m|140|380|ldn|cb,n,cd|2|4|s|8100170897|veg|simmered|north
Moong Dal Halwa|indian|dessert|v|d,n|m|160|460|ldn|cb,cd|3|3|s|9100180898|legumes|simmered|rajasthan
Kulfi Falooda|indian|dessert|v|d,n|m|140|380|ldn|cb,hw,h|3|3.5|s|9100171806|none|frozen|mumbai
Shahi Tukda|indian|dessert|v|d,g,n|m|160|480|dn|cb,r|4|3|s|9100171876|none|fried|hyderabad
Double Ka Meetha|indian|dessert|v|d,g,n|m|140|420|dn|cb,n|4|3|s|9100170786|none|baked|hyderabad
Mysore Pak|indian|dessert|v|d|m|120|420|ldn|cb,n|3|3|s|9200182595|legumes|cooked|karnataka
Kaju Katli|indian|dessert|v|n|m|180|320|ldn|cb,h|2|3.5|s|9100163403|none|cooked|india
Payasam|indian|dessert|v|d,n|m|110|320|ld|cb,n|3|4.5|s|8100150885|none|simmered|kerala
Phirni|indian|dessert|v|d,n|m|100|260|ldn|cb,r|3|4.5|s|8100150902|none|chilled|north
Modak|indian|dessert|v|d,n|m|110|260|ldn|cb,n|4|4.5|s|8100142573|none|steamed|maharashtra
Puran Poli|indian|dessert|v|d,g|m|80|320|ld|n,cb|5|4.5|s|8100140564|legumes|griddled|maharashtra
Tender Coconut Ice Cream|indian|dessert|v|d|m|120|240|ldn|hw,rx,h|3|4.5|s|7100140803|none|frozen|mumbai
Mango Shrikhand|indian|dessert|v|d,n|m|110|300|ldn|cb,hw|3|4.5|s|8240170802|none|chilled|gujarat
Chocolate Lava Cake|american|dessert|v|d,g,e|m|180|420|dn|cb,r,sd,s|2|2.5|s|9100190875|none|baked|cafe
Red Velvet Pastry|american|dessert|v|d,g,e|m|140|380|ldn|cb,r,h|2|2.5|s|8200170805|none|baked|cafe
Belgian Waffle with Nutella|american|dessert|v|d,g,e,n|m|220|560|bdn|cb,sd,h|2|2|s|9200185577|none|griddled|cafe
Death by Chocolate|american|dessert|v|d,g,e,n|m|220|620|dn|sd,s,cb|2|2|s|9200190806|none|chilled|cafe
Brownie with Ice Cream|american|dessert|v|d,g,e,n|m|180|520|dn|sd,s,cb|1|2|s|9200182747|none|baked|cafe
Panna Cotta|italian|dessert|v|d|m|180|300|dn|r,cb|4|3.5|s|8100150802|none|chilled|italy
Mango Lassi|indian|beverage|v|d|m|90|260|ld|hw,h|1|5.5|c|8130150701|none|blended|punjab
Sweet Lassi|indian|beverage|v|d|m|80|240|ld|hw,rx|1|5.5|c|8120160702|none|blended|punjab
Masala Buttermilk|indian|beverage|v|d|md|50|60|ld|hw,hl,rx|1|8|c|0542220201|none|raw|south
Filter Coffee|indian|beverage|v|d|m|60|90|bl|e,n|1|5|c|5000340591|none|brewed|tamil_nadu
Cold Coffee|american|beverage|v|d|m|140|280|lnd|e,hw,h|1|4|c|7100150802|none|blended|cafe
Nimbu Pani|indian|beverage|vg|-|m|50|80|ld|hw,hl,e|1|7.5|c|5370000001|none|raw|india
Jaljeera|indian|beverage|vg|-|md|50|40|ld|hw,a|3|7|c|2582200001|none|raw|north
Fresh Lime Soda|indian|beverage|vg|-|m|70|90|ld|hw,e|1|7|c|5460000001|none|raw|india
Badam Milk|indian|beverage|v|d,n|m|90|260|bdn|cd,c,sk|2|6|c|7100160694|none|simmered|south
Rose Falooda|indian|beverage|v|d,n|m|130|380|ldn|hw,cb|3|3.5|c|9000150705|none|chilled|mumbai
Thandai|indian|beverage|v|d,n|m|110|300|ld|cb,hw|4|5|c|7101260702|none|chilled|north
Kokum Sharbat|indian|beverage|vg|-|m|70|90|ld|hw,a|5|7|c|6650000001|none|raw|konkan
Sol Kadhi|indian|beverage|vg|-|m|70|90|ld|hw,a|6|7.5|c|2560240201|none|raw|konkan
Kashmiri Kahwa|indian|beverage|vg|n|m|90|60|bdn|cd,sk,rx|5|8|c|4100120091|none|brewed|kashmir
Choco Lava Shake|american|beverage|v|d|m|180|520|n|sd,s,cb|2|2|c|9100180805|none|blended|cafe
Green Detox Smoothie|american|beverage|vg|-|m|180|160|b|hl,e,hw|5|9|c|4250000201|none|blended|healthy
Peanut Butter Banana Smoothie|american|beverage|v|d,n|m|180|380|b|e,hl|3|6.5|c|7210150603|none|blended|healthy
Chilli Chicken Dry|chinese|snack|nv|y,g,e|h|280|480|dn|h,e,cb|3|4.5|s|3646765185|chicken|stir_fried|indo_chinese
Chilli Chicken Gravy|chinese|comfort_food|nv|y,g|h|290|520|dn|c,h|3|4.5|m|3646764396|chicken|stir_fried|indo_chinese
Chilli Paneer|chinese|snack|v|y,g,d|h|260|460|dn|h,e|3|5|s|3646665285|paneer|stir_fried|indo_chinese
Veg Manchurian Gravy|chinese|comfort_food|vg|y,g|md|220|420|dn|c,h,rn|3|5|m|3636654395|veg|fried|indo_chinese
Gobi Manchurian Dry|chinese|snack|vg|y,g|h|210|400|dn|h,e|3|4.5|s|3646655185|veg|fried|indo_chinese
Chicken Manchurian|chinese|comfort_food|nv|y,g,e|md|280|500|dn|c,h|3|4.5|m|3636764395|chicken|fried|indo_chinese
Veg Hakka Noodles|chinese|comfort_food|vg|y,g|md|180|420|dln|c,h,n|2|5|m|2614541185|veg|stir_fried|indo_chinese
Chicken Hakka Noodles|chinese|comfort_food|nv|y,g,e|md|220|480|dln|c,h|2|5|m|2615651286|chicken|stir_fried|indo_chinese
Schezwan Noodles|chinese|comfort_food|vg|y,g|vh|200|460|dln|a,e,h|4|4.5|m|2618651186|veg|stir_fried|indo_chinese
Chilli Garlic Noodles|chinese|comfort_food|vg|y,g|h|190|440|dln|h,e,a|3|4.5|m|1626651186|veg|stir_fried|indo_chinese
Chicken Schezwan Fried Rice|chinese|comfort_food|nv|y,e|vh|240|520|dln|a,e|4|4.5|m|2618652186|chicken|stir_fried|indo_chinese
Veg Fried Rice|chinese|comfort_food|vg|y|m|170|420|dln|c,n|1|5.5|m|1602541185|veg|stir_fried|indo_chinese
Egg Fried Rice|chinese|comfort_food|nv|y,e|m|180|460|dln|c,h|1|5.5|m|1602552185|egg|stir_fried|indo_chinese
Paneer Fried Rice|chinese|comfort_food|v|y,d|md|200|480|dln|c,h|2|5.5|m|1603562185|paneer|stir_fried|indo_chinese
Triple Schezwan Rice|chinese|indulgent|nv|y,g,e|vh|300|720|dn|a,cb|5|4|m|2628664297|chicken|stir_fried|indo_chinese
American Chop Suey|chinese|indulgent|nv|y,g,e|md|280|620|dn|n,a|5|4|m|5644557296|chicken|fried|indo_chinese
Manchow Soup|chinese|light_meal|vg|y,g|h|150|180|dn|sk,cd,rn,c|2|6.5|s|1666632292|veg|simmered|indo_chinese
Sweet Corn Chicken Soup|chinese|light_meal|nv|e|m|160|200|dn|sk,c,cd,rn|1|6.5|s|3511531392|chicken|simmered|indo_chinese
Honey Chilli Potato|chinese|snack|vg|y,g|md|190|460|dn|h,e,cb|2|3.5|s|6634457174|veg|fried|indo_chinese
Crispy Corn|chinese|snack|vg|y|md|180|380|dn|h,e|2|4|s|3535458174|veg|fried|indo_chinese
Dragon Chicken|chinese|snack|nv|y,g,n|vh|300|520|dn|a,cb|5|4.5|s|4637765185|chicken|stir_fried|indo_chinese
Chicken Lollipop|chinese|snack|nv|y,g,e|h|280|480|dn|h,cb|3|4|s|2636667175|chicken|fried|indo_chinese
Szechuan Prawns|chinese|indulgent|nv|s,y|vh|420|420|dn|a,cb|6|5.5|m|3638762285|prawn|stir_fried|indo_chinese
Chicken Fried Momos with Schezwan Dip|chinese|snack|nv|g,y|vh|190|440|dn|h,e,a|3|4|s|1637655274|chicken|fried|indo_chinese
Tofu Stir Fry Bowl|chinese|light_meal|vg|y|md|280|380|ld|hl,a|5|8.5|m|2524642274|tofu|stir_fried|healthy
Korean Fried Chicken|korean|indulgent|nv|y,g|h|380|620|dn|cb,h,a|5|4|m|5636769176|chicken|fried|seoul
Bibimbap|korean|light_meal|nv|y,e|md|340|520|ld|hl,a,h|6|7.5|m|2535631275|egg|mixed|seoul
Chicken Bulgogi Rice Bowl|korean|comfort_food|nv|y|md|360|560|ld|h,a|5|6|m|5613751286|chicken|grilled|seoul
Kimchi Fried Rice|korean|comfort_food|nv|y,e|h|300|500|ld|a,h|6|6|m|2666652186|egg|stir_fried|seoul
Tteokbokki|korean|street_food|vg|y|vh|260|420|ldn|a,e,h|7|4.5|m|5617550596|veg|simmered|seoul
Korean Ramyeon|korean|comfort_food|nv|y,g,e|vh|240|500|dn|a,cd,rn,n|5|3.5|m|1718760595|egg|simmered|seoul
Kimchi Jjigae|korean|comfort_food|nv|y|vh|340|420|ld|a,cd,rn|7|7|m|1677740193|chicken|simmered|seoul
Japchae|korean|light_meal|vg|y|m|300|420|ld|a,h|7|6.5|m|4613542285|veg|stir_fried|seoul
Korean Corn Dog|korean|street_food|v|g,d,e|md|180|440|dn|h,a,e|5|3|m|5500567575|cheese|fried|seoul
Gimbap|korean|light_meal|nv|y,e|m|280|380|l|h,rx|6|7|m|1532421123|egg|raw|seoul
Chicken Teriyaki Bowl|japanese|comfort_food|nv|y,g|m|360|560|ld|h,c|3|6.5|m|5613651286|chicken|grilled|tokyo
Veg Sushi Roll|japanese|light_meal|vg|y|m|320|300|ld|hl,a|5|7.5|m|2531432212|veg|raw|tokyo
Salmon Sushi Roll|japanese|light_meal|nv|y|m|480|340|ld|a,cb,r|6|7.5|m|2531642212|fish|raw|tokyo
Chicken Katsu Curry|japanese|comfort_food|nv|g,e,y|md|380|720|ld|c,a|4|4.5|m|3524668797|chicken|fried|tokyo
Spicy Miso Ramen|japanese|comfort_food|nv|y,g,e|h|360|620|dn|c,cd,rn,a|5|5|m|1716861397|chicken|simmered|tokyo
Edamame|japanese|snack|vg|y|m|220|180|ld|hl,rx|3|8.5|s|0600322161|legumes|steamed|tokyo
Thai Red Curry with Rice|thai|comfort_food|vg|y|h|340|540|ld|a,c|5|6|m|3627561795|veg|curry|bangkok
Thai Green Curry Veg|thai|comfort_food|vg|-|vh|320|480|ld|a,c|5|6.5|m|3628561795|veg|curry|bangkok
Tom Kha Soup|thai|light_meal|nv|-|md|260|300|ld|sk,rx,rn|6|7|s|3554550792|chicken|simmered|bangkok
Thai Pineapple Fried Rice|thai|comfort_food|nv|y,s,n|md|320|520|ld|a,h|5|5.5|m|6543642185|prawn|stir_fried|bangkok
Drunken Noodles|thai|comfort_food|nv|y,g|vh|330|540|dn|a,e|6|5|m|3628752286|chicken|stir_fried|bangkok
Thai Peanut Noodle Salad|thai|light_meal|vg|n,y|md|280|420|l|hl,a|5|7|m|5543533242|veg|raw|bangkok
Farmhouse Pizza|italian|comfort_food|v|g,d|m|320|720|dn|h,cb|2|4.5|m|2631664586|cheese|baked|indian_pizza
Paneer Tikka Pizza|italian|comfort_food|v|g,d|md|360|760|dn|h,cb,a|3|4.5|m|2633664586|paneer|baked|indian_pizza
Chicken Tikka Pizza|italian|comfort_food|nv|g,d|md|380|780|dn|h,cb|3|4.5|m|2633674586|chicken|baked|indian_pizza
Pepper Barbecue Chicken Pizza|italian|indulgent|nv|g,d|md|400|820|dn|cb,h|3|4|m|4632674587|chicken|baked|indian_pizza
Veggie Supreme Pizza|italian|comfort_food|v|g,d|md|350|740|dn|h,cb|2|4.5|m|2632664586|cheese|baked|indian_pizza
Cheese Burst Pizza|italian|indulgent|v|g,d|m|380|880|dn|cb,sd,s|2|3|m|2621784688|cheese|baked|indian_pizza
Garlic Breadsticks|italian|snack|v|g,d|m|130|320|dn|h,c|1|4|s|0600564374|none|baked|indian_pizza
Cheesy Garlic Bread|italian|snack|v|g,d|m|160|380|dn|h,c,sd|1|3.5|s|0600675475|cheese|baked|cafe
White Sauce Pasta|italian|comfort_food|v|g,d|m|260|620|ld|c,h,sd|2|4.5|m|1500570887|cheese|simmered|indian_cafe
Red Sauce Pasta|italian|comfort_food|v|g,d|md|250|520|ld|c,h|2|5.5|m|2544540385|veg|simmered|indian_cafe
Pink Sauce Pasta|italian|comfort_food|v|g,d|md|270|580|ld|c,h|2|5|m|2533570686|veg|simmered|indian_cafe
Chicken Alfredo Pasta|italian|indulgent|nv|g,d|m|320|720|ld|c,cb,sd|3|4|m|1500680897|chicken|simmered|cafe
Pesto Chicken Pasta|italian|comfort_food|nv|g,d,n|m|330|640|ld|h,a|4|5|m|0510670686|chicken|simmered|cafe
Mushroom Pasta|italian|comfort_food|v|g,d|m|280|600|ld|c,rx|3|5|m|1500780786|veg|simmered|cafe
Spaghetti Aglio e Olio|italian|light_meal|vg|g|md|240|480|ld|rx,h|3|6|m|0503450274|none|sauteed|italy
Caprese Salad|italian|light_meal|v|d|m|280|280|l|hl,r,hw|4|7.5|s|2531332402|cheese|raw|italy
Arancini|italian|snack|v|g,d,e|m|260|420|dn|a,h|5|4|s|1500567575|cheese|fried|italy
Calzone|italian|indulgent|v|g,d|m|340|760|dn|cb,a|4|4|m|1631674587|cheese|baked|italy
Crispy Chicken Burger|american|indulgent|nv|g,d,e|md|200|620|ldn|h,c,e|1|4|m|2621677577|chicken|fried|qsr
Aloo Tikki Burger|american|comfort_food|v|g,d|md|90|420|ldn|h,c,n|1|4.5|m|2633456475|veg|fried|qsr
Paneer Burger|american|comfort_food|v|g,d|md|170|520|ldn|h,c|2|4.5|m|2533566475|paneer|fried|qsr
Flame Grilled Veg Burger|american|indulgent|v|g,d|md|190|580|ldn|h,cb|2|4|m|2632567476|veg|grilled|qsr
Double Chicken Cheese Burger|american|indulgent|nv|g,d,e|md|280|780|dn|cb,sd,s|2|3|m|2621785588|chicken|grilled|qsr
Peri Peri Fries|american|snack|vg|-|h|130|420|ldn|h,e|2|3.5|s|1726358174|veg|fried|qsr
Cheese Fries|american|snack|v|d|m|160|520|dn|sd,h|1|3|s|0700679576|cheese|fried|qsr
Chicken Nuggets|american|snack|nv|g,e|m|170|420|ldn|h,n|1|4|s|1600469174|chicken|fried|qsr
Chicken Popcorn|american|snack|nv|g,e|md|160|400|ldn|h,e|1|4|s|1621469174|chicken|fried|qsr
Chicken Club Sandwich|american|light_meal|nv|g,d,e|m|260|560|bln|h,rx|2|5.5|m|1521546465|chicken|toasted|cafe
Veg Club Sandwich|american|light_meal|v|g,d|m|220|480|bln|h,rx|2|6|m|1521345465|veg|toasted|cafe
Chicken Caesar Salad|american|light_meal|nv|d,e,g|m|320|420|ld|hl,e|3|7|m|1631546303|chicken|raw|cafe
Grilled Chicken Wrap|american|light_meal|nv|g,d|md|240|460|ldn|hl,e|2|6.5|m|1533543374|chicken|grilled|cafe
Peri Peri Chicken Wrap|american|street_food|nv|g,d|h|220|480|ldn|e,h|3|6|m|1546543374|chicken|grilled|qsr
Avocado Toast|american|light_meal|vg|g|m|280|340|bl|hl,rx|4|7.5|m|1533354233|veg|toasted|cafe
Eggs Benedict|american|light_meal|nv|e,g,d|m|340|520|b|cb,rx,r|5|5|m|1631680774|egg|poached|cafe
English Breakfast Platter|american|indulgent|nv|e,g,d|m|420|820|b|cb,h|4|4|m|1631671498|chicken|griddled|cafe
Banana Pancakes|american|comfort_food|v|g,d,e|m|180|460|b|h,rx|2|5.5|m|8100151465|none|griddled|cafe
Fish and Chips|american|indulgent|nv|g,e|m|380|720|dn|n,c|4|4|m|1610458176|fish|fried|cafe
Grilled Chicken Salad Bowl|american|light_meal|nv|-|m|300|380|ld|hl,e|3|8.5|m|1531441202|chicken|grilled|cafe
Egg White Omelette Bowl|american|light_meal|nv|e|m|220|260|b|hl,e|3|8.5|m|0503420164|egg|griddled|healthy
Acai Smoothie Bowl|american|light_meal|vg|n|m|360|360|b|hl,e,hw|6|8|m|7150123402|none|blended|healthy
Chicken Quinoa Salad|american|light_meal|nv|-|m|340|420|l|hl,e|4|9|m|1541431302|chicken|raw|healthy
Grilled Fish with Veggies|american|light_meal|nv|-|m|420|360|ld|hl,rx|4|8.5|m|1531541283|fish|grilled|healthy
Mexican Rice Bowl|mexican|comfort_food|v|d|md|260|540|ld|h,a|3|6|m|1534542286|legumes|mixed|cafe
Chicken Burrito|mexican|indulgent|nv|g,d|md|280|680|ldn|h,e|3|5|m|1535553387|chicken|grilled|qsr
Veg Burrito|mexican|comfort_food|v|g,d|md|240|620|ldn|h,c|3|5.5|m|1535453387|legumes|grilled|qsr
Cheese Nachos with Salsa|mexican|snack|v|d|md|200|520|dn|h,cb|2|3.5|s|1745468564|cheese|baked|qsr
Paneer Quesadilla|mexican|comfort_food|v|g,d|md|250|560|ldn|h,a|3|5|m|1523575586|paneer|griddled|cafe
Chicken Fajita Bowl|mexican|light_meal|nv|-|md|300|480|ld|hl,e|4|7|m|1535642285|chicken|grilled|cafe
Chicken Shawarma Roll|mediterranean|street_food|nv|g,d|md|170|520|lnd|h,e,n|2|5|m|1534554476|chicken|grilled|levant
Chicken Shawarma Platter|mediterranean|comfort_food|nv|d,g|md|320|620|ldn|h,a|3|6|m|1534654386|chicken|grilled|levant
Paneer Shawarma Roll|mediterranean|street_food|v|g,d|md|160|480|lnd|h,e|3|5.5|m|1534454475|paneer|grilled|levant
Falafel Platter|mediterranean|light_meal|vg|g|md|280|520|ld|hl,a|4|7|m|1533445475|legumes|fried|levant
Mezze Platter|mediterranean|light_meal|v|d,g|m|420|560|ld|hl,a,r|5|7.5|m|1541453634|legumes|mixed|levant
Chicken Souvlaki|mediterranean|light_meal|nv|d|md|340|460|ld|hl,h|5|7|m|1542543284|chicken|grilled|greece
Lebanese Fattoush|mediterranean|light_meal|vg|g|m|240|240|l|hl,hw|5|8.5|s|1550227101|veg|raw|levant
Chicken Mandi|mediterranean|indulgent|nv|d|md|420|820|ld|cb,a|6|5|m|1525661098|chicken|roasted|yemen
Mutton Mandi|mediterranean|indulgent|nv|d|md|520|880|ld|cb,a|6|4.5|m|1525771098|mutton|roasted|yemen
Turkish Kebab Platter|mediterranean|indulgent|nv|d|h|440|640|dn|cb,a|5|5.5|m|1536762286|mutton|grilled|turkey
Mediterranean Chickpea Bowl|mediterranean|light_meal|vg|-|m|280|420|ld|hl,e|4|8.5|m|1542432233|legumes|raw|healthy
Paneer Tikka Salad Bowl|indian|light_meal|v|d|md|280|380|ld|hl,e|3|8|m|1533441303|paneer|tandoor|healthy
Sprouts Chaat Salad|indian|light_meal|vg|-|md|150|220|bl|hl,e,hw|3|9|s|1563328001|legumes|raw|healthy
Millet Khichdi Bowl|indian|light_meal|v|d|m|200|380|ld|hl,sk,c|5|8.5|m|0412340594|legumes|simmered|healthy
High Protein Chicken Rice Bowl|indian|light_meal|nv|-|md|300|520|ld|hl,e|3|8|m|1525541285|chicken|grilled|healthy
Soya Chunk Curry Bowl|indian|light_meal|vg|y|md|220|420|ld|hl,e|4|8|m|1525550385|tofu|curry|healthy
"""

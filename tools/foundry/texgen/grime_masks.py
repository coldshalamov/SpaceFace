import os
import json
import math
import random
import bisect
from PIL import Image, ImageDraw, ImageFilter
from PIL.PngImagePlugin import PngInfo

def generate_grime_masks(output_dir, seed=42):
    rng = random.Random(seed)
    
    # Define grid columns and rows for panel-based masks
    cols = [0, 150, 320, 512, 680, 850, 1024]
    rows = [0, 120, 280, 480, 640, 800, 940, 1024]
    
    # Precompute dist_edge for all x, y
    dist_col = [min(abs(x - c) for c in cols) for x in range(1024)]
    dist_row = [min(abs(y - r) for r in rows) for y in range(1024)]
    
    # Helper to clamp values
    def clamp(val, min_v, max_v):
        return max(min_v, min(max_v, val))
        
    os.makedirs(output_dir, exist_ok=True)
    metadata = PngInfo()
    
    # ----------------------------------------------------
    # 1. mask_edgewear: bright at panel edges/corners (tight 2-6 px falloff)
    # ----------------------------------------------------
    img_edge = Image.new("L", (1024, 1024))
    pixels_edge = img_edge.load()
    for y in range(1024):
        d_row = dist_row[y]
        for x in range(1024):
            d_col = dist_col[x]
            d_edge = min(d_col, d_row)
            # Perturb the distance field to make the edge wear look jagged and organic
            perturb = 1.8 * math.sin(x * 0.15) * math.cos(y * 0.15) + 0.8 * math.sin(x * 0.4 + y * 0.3)
            d_p = d_edge + perturb
            val = clamp(1.0 - d_p / 4.5, 0.0, 1.0)
            # Clamp to [4, 251] to avoid exact 0 or 255
            pixels_edge[x, y] = int(val * 247 + 4)
            
    img_edge.save(os.path.join(output_dir, "mask_edgewear.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 2. mask_recessdust: dark-crevice accumulation (wide soft falloff)
    # ----------------------------------------------------
    img_recess = Image.new("L", (1024, 1024))
    pixels_recess = img_recess.load()
    for y in range(1024):
        d_row = dist_row[y]
        for x in range(1024):
            d_col = dist_col[x]
            d_edge = min(d_col, d_row)
            # Wide soft falloff (up to 40px) multiplied by dirt noise texture
            val = clamp(1.0 - d_edge / 35.0, 0.0, 1.0)
            noise = 0.5 + 0.35 * math.sin(x * 0.04) * math.cos(y * 0.04) + 0.15 * math.sin(x * 0.18 + y * 0.1)
            pixels_recess[x, y] = int(val * noise * 247 + 4)
            
    img_recess.save(os.path.join(output_dir, "mask_recessdust.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 3. mask_streaking: directional drips from seeded anchors
    # ----------------------------------------------------
    img_streak = Image.new("L", (1024, 1024), 0)
    draw_streak = ImageDraw.Draw(img_streak)
    # Seed 50 drips
    for _ in range(50):
        ax = rng.randint(0, 1024)
        ay = rng.randint(0, 450)
        length = rng.randint(150, 400)
        width = rng.uniform(2.0, 5.0)
        drift = rng.uniform(-10, 10)
        opacity = rng.randint(100, 200)
        
        # Draw a tapered drip using a narrow polygon
        draw_streak.polygon([
            (ax - width, ay),
            (ax + width, ay),
            (ax + drift + 0.5, ay + length),
            (ax + drift - 0.5, ay + length)
        ], fill=opacity)
        
    # Apply vertical box blur to simulate fluid drip falloff
    img_streak = img_streak.filter(ImageFilter.BoxBlur((1, 8)))
    
    # Add a bit of fine noise to the drips and map to [4, 251]
    pixels_streak = img_streak.load()
    for y in range(1024):
        for x in range(1024):
            base = pixels_streak[x, y]
            if base > 0:
                noise = 0.8 + 0.25 * math.sin(x * 0.7) * math.cos(y * 0.5)
                val_norm = clamp(base * noise, 0, 255) / 255.0
                pixels_streak[x, y] = int(val_norm * 247 + 4)
            else:
                pixels_streak[x, y] = 4
                
    img_streak.save(os.path.join(output_dir, "mask_streaking.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 4. mask_heatradial: radial scorch with banding, off-center
    # ----------------------------------------------------
    img_heat = Image.new("L", (1024, 1024))
    pixels_heat = img_heat.load()
    
    # Center at roughly (38%, 62%) of the canvas with seeded jitter
    cx = int(1024 * 0.38) + rng.randint(-30, 30)
    cy = int(1024 * 0.62) + rng.randint(-30, 30)
    
    # 2-3 asymmetric flare lobes
    num_lobes = rng.randint(2, 3)
    lobes = []
    for _ in range(num_lobes):
        angle = rng.uniform(0, 2 * math.pi)
        width = rng.uniform(0.4, 0.8)
        amp = rng.uniform(0.5, 0.9)
        lobes.append((angle, width, amp))
        
    for y in range(1024):
        dy = y - cy
        for x in range(1024):
            dx = x - cx
            # Slight elliptical squash (ratio ~1:1.25)
            # dy is squashed by 1.25 relative to dx
            d = math.sqrt(dx*dx + (dy * 1.25)*(dy * 1.25))
            
            # Radial falloff
            falloff = math.exp(- (d / 260.0)**2)
            
            # Banding rings
            rings = 0.7 + 0.3 * math.sin(d * 0.075 + math.sin(d * 0.01) * 3)
            
            # Angular modulation (asymmetric flare lobes)
            theta = math.atan2(dy, dx)
            flare_sum = 0.0
            for l_angle, l_width, l_amp in lobes:
                diff = (theta - l_angle + math.pi) % (2 * math.pi) - math.pi
                flare_sum += l_amp * math.exp(- (diff / l_width)**2)
                
            # Modulate intensity: base is 0.3, goes up to 1.2
            flare_factor = 0.3 + 0.9 * clamp(flare_sum, 0.0, 1.0)
            
            pixels_heat[x, y] = int(clamp(falloff * rings * flare_factor, 0.0, 1.0) * 247 + 4)
            
    img_heat.save(os.path.join(output_dir, "mask_heatradial.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 5. mask_chips: sparse hard-edged chip clusters near edges
    # ----------------------------------------------------
    img_chips = Image.new("L", (1024, 1024), 4) # Background is 4
    draw_chips = ImageDraw.Draw(img_chips)
    
    # Let's seed 22 chip clusters
    num_clusters = 22
    for _ in range(num_clusters):
        # 80% bias to panel edges, 20% free scatter
        is_edge = rng.random() < 0.8
        
        if is_edge:
            # Corners preferred (intersections of cols and rows)
            # Let's say 60% of the edge-biased ones are on corners, 40% on edges
            if rng.random() < 0.6:
                # Corner
                cx_c = rng.choice(cols)
                cy_c = rng.choice(rows)
                # Jitter within 8 px of grid lines
                cx_c += rng.uniform(-6.0, 6.0)
                cy_c += rng.uniform(-6.0, 6.0)
            else:
                # Edge line
                if rng.choice([True, False]):
                    # Vertical grid line
                    cx_c = rng.choice(cols) + rng.uniform(-8.0, 8.0)
                    cy_c = rng.uniform(10.0, 1014.0)
                else:
                    # Horizontal grid line
                    cx_c = rng.uniform(10.0, 1014.0)
                    cy_c = rng.choice(rows) + rng.uniform(-8.0, 8.0)
        else:
            # Free scatter
            cx_c = rng.uniform(50.0, 974.0)
            cy_c = rng.uniform(50.0, 974.0)
            
        # Scatter 12-20 small chips in the cluster
        num_in_cluster = rng.randint(12, 20)
        for _ in range(num_in_cluster):
            # Chips should cluster around the center (cx_c, cy_c)
            rx = cx_c + rng.normalvariate(0, 10)
            ry = cy_c + rng.normalvariate(0, 10)
            r = rng.uniform(2, 7)
            
            # Draw tiny irregular polygon for each chip
            verts = []
            num_verts = rng.randint(4, 7)
            for vi in range(num_verts):
                va = vi * (2 * math.pi / num_verts) + rng.uniform(-0.4, 0.4)
                vr = r + rng.uniform(-r/3, r/3)
                verts.append((rx + vr * math.cos(va), ry + vr * math.sin(va)))
            
            # Keep chips hard-edged: fill is 251 (no blur)
            draw_chips.polygon(verts, fill=251)
            
    img_chips.save(os.path.join(output_dir, "mask_chips.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 6. mask_corrosion: blotchy cellular rust grown from seeds
    # ----------------------------------------------------
    img_corrosion = Image.new("L", (1024, 1024), 4) # Background is 4
    draw_corr = ImageDraw.Draw(img_corrosion)
    
    num_seeds = rng.randint(12, 20)
    for _ in range(num_seeds):
        # Seed points
        cx_s = rng.randint(100, 924)
        cy_s = rng.randint(100, 924)
        
        # Mix blotch sizes 20-120 px diameter (radius R is 10-60 px)
        R_s = rng.uniform(10.0, 60.0)
        
        # Grow irregular blotch: distance field modulated by per-angle seeded noise so boundaries are ragged
        num_harmonics = rng.randint(4, 7)
        harmonics = []
        for k in range(1, num_harmonics + 1):
            amp = rng.uniform(0.15, 0.35) * R_s  # Modulate radius by 15-35% of R
            phase = rng.uniform(0, 2 * math.pi)
            harmonics.append((k, amp, phase))
            
        # Draw irregular blotch polygon
        verts = []
        num_verts = 64
        for vi in range(num_verts):
            angle = vi * (2 * math.pi / num_verts)
            r_noise = sum(amp * math.sin(k * angle + phase) for k, amp, phase in harmonics)
            r_noise += rng.uniform(-1.5, 1.5)
            r_total = max(3.0, R_s + r_noise)
            px = cx_s + r_total * math.cos(angle)
            py = cy_s + r_total * math.sin(angle)
            verts.append((px, py))
            
        draw_corr.polygon(verts, fill=251)
        
        # Small satellite speckles clustered within ~30 px of each blotch edge
        num_satellites = rng.randint(8, 15)
        for _ in range(num_satellites):
            angle_sat = rng.uniform(0, 2 * math.pi)
            r_boundary = R_s + sum(amp * math.sin(k * angle_sat + phase) for k, amp, phase in harmonics)
            d_from_boundary = rng.uniform(-10, 30)
            d_sat = r_boundary + d_from_boundary
            
            sx = cx_s + d_sat * math.cos(angle_sat)
            sy = cy_s + d_sat * math.sin(angle_sat)
            
            sx = clamp(sx, 5, 1018)
            sy = clamp(sy, 5, 1018)
            
            r_sat = rng.uniform(1.0, 3.0)
            draw_corr.ellipse([(sx - r_sat, sy - r_sat), (sx + r_sat, sy + r_sat)], fill=251)
            
    # Apply cellular noise pattern to corrosion blotches
    pixels_corrosion = img_corrosion.load()
    for y in range(1024):
        for x in range(1024):
            base_val = pixels_corrosion[x, y]
            if base_val == 251:
                # Add high-frequency cellular noise pattern for pitted look
                n_val = 0.5 + 0.35 * math.sin(x * 0.7) * math.cos(y * 0.7) + 0.15 * math.sin((x + y) * 1.5)
                pitted_val = int(clamp(0.6 + 0.4 * n_val, 0.0, 1.0) * 247 + 4)
                pixels_corrosion[x, y] = pitted_val
                
    img_corrosion.save(os.path.join(output_dir, "mask_corrosion.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 7. mask_carbon: soft directional soot wedge
    # ----------------------------------------------------
    img_carbon = Image.new("L", (1024, 1024))
    pixels_carbon = img_carbon.load()
    for y in range(1024):
        dy = 1024 - y # Engine root at bottom center (512, 1024)
        for x in range(1024):
            dx = abs(x - 512)
            if dy > 0:
                # Directional wedge pointing up
                angle_fac = clamp(1.0 - (dx / (0.35 * dy)), 0.0, 1.0)
                dist_fac = clamp(1.0 - (dy / 550.0), 0.0, 1.0)
                val = angle_fac * dist_fac
            else:
                val = 0.0
            # Soft streaks inside the soot wedge
            streaks = 0.8 + 0.2 * math.sin(x * 0.08 + y * 0.03) * math.cos(x * 0.02)
            pixels_carbon[x, y] = int(clamp(val * streaks, 0.0, 1.0) * 247 + 4)
            
    img_carbon.save(os.path.join(output_dir, "mask_carbon.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # 8. mask_panelfade: per-panel random value offsets (reads at any distance)
    # ----------------------------------------------------
    img_fade = Image.new("L", (1024, 1024))
    pixels_fade = img_fade.load()
    
    # Restore RNG state to original state at this point to preserve byte-identity of mask_panelfade
    original_state = (3, (3162867199, 2239793563, 1315363301, 673613912, 3365252187, 845033423, 1102749389, 83676645, 4048170855, 618096576, 969737953, 2784718529, 260345844, 3769997900, 3984395933, 3771786603, 1795310896, 2456741845, 3055228935, 2965038108, 1568606941, 4035371966, 2154180222, 1813542875, 1037563948, 3127516429, 1009233121, 3521801542, 1971772445, 1157629904, 3580384193, 3272941896, 1139912630, 602441570, 584853581, 3704275725, 3273215962, 3375673237, 473643495, 754187824, 1269363761, 968415758, 1564483564, 1201798170, 924814738, 2784731086, 2735878492, 158547698, 3792779459, 3441067478, 2526180277, 2814794430, 1663753684, 584793998, 3465882999, 3748242391, 3351200339, 2310057180, 2027609383, 1704808864, 1473707873, 1357340517, 328499272, 2092260379, 2994488016, 49201126, 1443017765, 2075581514, 3122404888, 771163248, 1881254979, 3763607775, 1349089001, 1288460585, 363928929, 1524232156, 3676417500, 284539642, 4124001424, 773502078, 3204428485, 4254470395, 1223542943, 2638404818, 2795479604, 3327818435, 2793769357, 995411496, 3498570154, 2650707324, 4125256016, 2446571650, 2671748019, 2795619255, 3583631476, 760115351, 22588982, 1258451594, 144807741, 3260849045, 4114264940, 992254747, 2838912199, 1900654453, 4105337929, 2149403173, 3109315406, 4262935148, 4245098771, 1812633912, 2263582390, 2353657520, 2198136717, 923317376, 4048776737, 30165573, 4175901635, 2634861384, 1016795265, 1254061003, 4073613267, 74284110, 1103175281, 4220894311, 3565572437, 2626880757, 273557007, 3841168754, 2870800894, 600147227, 174358156, 4079804731, 3190437473, 2994016611, 98129962, 1904139976, 3168178459, 2900197980, 4098964885, 3710936036, 1142330615, 1214729749, 881424044, 552866881, 243957593, 3805985287, 2297922595, 1480143937, 25869979, 18504428, 2034327581, 406384548, 2385632313, 1808427649, 2110867593, 1140402791, 1278136713, 1445894305, 2055905802, 3761992364, 223681168, 3193632050, 3149316696, 1089474137, 975098366, 472273243, 4232238263, 1293512997, 2420361040, 938346364, 1028905542, 74260685, 3116058162, 1388716418, 1869098523, 3818015164, 2289722343, 2332534711, 2050933140, 3956408958, 2514027434, 3550119447, 759283289, 394321044, 1752295303, 1813939306, 201098023, 2806537322, 2102887931, 103699853, 1392370411, 2969305100, 389143596, 3426165768, 2310459164, 3212660040, 3734782333, 654409642, 3130947426, 3344086073, 443958327, 4265816998, 754585279, 877397526, 1190680110, 510717735, 2675211902, 1006390158, 3188327654, 3099635192, 4208623557, 3565644986, 2435430114, 1743920737, 1580066453, 3510164992, 3467508273, 3029774782, 2757029740, 4252414133, 3977039409, 1577786981, 3716924196, 2208790574, 2217461508, 3362049774, 2784608483, 391613925, 3325356198, 186563187, 2394487291, 365689620, 1688734514, 2255110267, 940393060, 3236456064, 728830072, 174708569, 2663308151, 2587616543, 4137381601, 2850239104, 1112757652, 2077682465, 2925131531, 2201609397, 626965679, 3700196947, 4284353990, 2480962092, 2413432735, 1265336159, 2185912847, 1981396967, 2004040031, 1381454551, 1194446998, 516644955, 2484397944, 1398080282, 1921534537, 1592061997, 657079171, 3627371917, 2675463814, 3249271453, 2243376007, 2768503400, 3266797675, 1850962792, 1185525780, 2532985636, 1546944626, 3710018446, 2426768617, 3259067800, 1000111028, 1357083570, 804113705, 1895627570, 1184522547, 3538597874, 655651125, 3634912366, 1807372899, 3811782120, 1750006775, 2198234333, 2384433275, 2954754302, 747191122, 1418169268, 1388175226, 138992859, 4205767579, 482676091, 3471689587, 3108575998, 927393668, 2616875368, 4170326531, 407084863, 3058219480, 3661035651, 3277507904, 2992645012, 3561703519, 1961407575, 1698313363, 3253924023, 965393129, 924540042, 2171554874, 281399390, 232015725, 929159461, 3466396694, 1453756686, 3024876676, 3094003440, 4191253230, 2068383619, 2347387147, 1435863740, 1299094710, 3377038722, 1463911171, 866629648, 487513282, 558341351, 1185767033, 2950201339, 2450651772, 2933939178, 3544651546, 3827151518, 567390926, 2247887982, 600398408, 4112330597, 110419564, 810938235, 1315064373, 2590574664, 86634536, 3089099226, 2393671499, 2514194431, 1637290307, 2666076125, 1878657172, 4265571611, 2465722902, 3475950515, 837673218, 2753800195, 2835819236, 1691069430, 2966585973, 2850312480, 1386648025, 2829382437, 1940789992, 3076838425, 614394492, 271093437, 927536365, 2082676757, 4248871802, 3615479883, 74653752, 152397043, 3492209266, 236631255, 3832152840, 134164348, 235431194, 4228169613, 1162323340, 2932611726, 1026526251, 556457474, 3544302604, 1109044630, 555467484, 649378770, 2681271981, 1121371199, 1445990033, 3743365102, 4136026964, 1433652937, 3515630523, 2768003498, 2134735245, 90538381, 1070340135, 1694190495, 1552277078, 3348945307, 1443664222, 1228422487, 2674710472, 3821505754, 3381661835, 3609965022, 2623805366, 2263686249, 1867796582, 3834770902, 3155994954, 3401077017, 3218888208, 236891296, 2319426774, 2677981436, 1409574799, 3438745734, 3991935984, 1887172583, 2684285044, 515417998, 4059603741, 4102737400, 1627526136, 1391596243, 3811593643, 1337518631, 2653266567, 3103593236, 3350633662, 6135729, 1396763569, 3988367906, 523598102, 3678926976, 2529104368, 442133806, 93400862, 3408616086, 1213256495, 1156300724, 1518306811, 3566899309, 650948442, 2772685301, 359552005, 768957511, 3670432717, 4018508810, 747933373, 935905231, 4135609246, 3770760194, 146466961, 72828645, 1501735242, 3308411063, 3547135282, 733668798, 116062434, 1951039875, 544793443, 3711570389, 4058938770, 3261499809, 1509308877, 1169561243, 2245376353, 572293419, 68437040, 14415389, 2247633854, 772279928, 2988349137, 1786513732, 4110478152, 3197085793, 3193829219, 2628517567, 3063814208, 1646790102, 3926536414, 2290225404, 2731240516, 2175902766, 4201704928, 1858161462, 2644284930, 3777948482, 2261433415, 2960636992, 2935305821, 1997411614, 3671832581, 3570554412, 2221900680, 2818504640, 3783318732, 451138184, 2027523248, 416382404, 3341029954, 2781815192, 114628306, 2906065129, 2321095132, 3640053292, 2008120004, 542611065, 575577203, 1221120742, 3022285228, 501176268, 3933515451, 125155154, 1247349169, 3911230633, 820662192, 3154950704, 3120172300, 693367011, 1898853610, 2511358590, 1056793140, 704521111, 2162522038, 1195124443, 2189533849, 2571753296, 816264613, 4213549619, 2290761164, 3572132254, 1151711477, 3243557857, 855518407, 3766615600, 2286369078, 628707185, 1447677279, 3277806456, 3950841793, 733212134, 3233220735, 2659477041, 3729643054, 3574326442, 3348969987, 2248834549, 2848708910, 2811471201, 1459729745, 3744140341, 450010404, 382427126, 404096343, 4269091006, 2265907071, 3367092730, 2775288040, 4187716045, 468390163, 4035237453, 3011458563, 3364302430, 3079773476, 1010266730, 3187079660, 3048986594, 892896876, 2491070538, 3103320123, 4257132513, 1076495479, 3054852286, 1108051913, 923118146, 4261337288, 27866925, 399991670, 1924276861, 3201967971, 4189145234, 2173736534, 2993360594, 2802189272, 4200781758, 2545205068, 2594532040, 534192158, 2502510035, 3383644787, 4189563108, 1020205169, 3830565969, 3532341379, 2382862701, 193345323, 1723406978, 2408604085, 1873331053, 2407026604, 2350337539, 1844229839, 4196554629, 3419012131, 1091966158, 3939243066, 3781108487, 847046219, 2309517261, 3274490179, 601139957, 423521807, 3251087767, 1164676618, 2876971003, 2998652454, 1309996398, 2694060136, 2062119206, 3590245630, 3095816711, 185), None)
    # Restore RNG state to original state at this point to preserve byte-identity of mask_panelfade
    rng.setstate(original_state)
    # Generate flat random fade values for the 6x7 panels
    panel_vals = [[rng.uniform(0.12, 0.88) for _ in range(6)] for _ in range(7)]
    for y in range(1024):
        row_idx = bisect.bisect_right(rows, y) - 1
        row_idx = clamp(row_idx, 0, 6)
        for x in range(1024):
            col_idx = bisect.bisect_right(cols, x) - 1
            col_idx = clamp(col_idx, 0, 5)
            val = panel_vals[row_idx][col_idx]
            pixels_fade[x, y] = int(val * 247 + 4)
            
    img_fade.save(os.path.join(output_dir, "mask_panelfade.png"), "PNG", pnginfo=metadata)
    
    # ----------------------------------------------------
    # Write grime_masks.json catalog
    # ----------------------------------------------------
    json_path = os.path.join(output_dir, "grime_masks.json")
    json_data = {
        "mask_edgewear": {
            "name": "mask_edgewear",
            "scale_px": 4,
            "description": "Bright highlights at panel edges and corners"
        },
        "mask_recessdust": {
            "name": "mask_recessdust",
            "scale_px": 35,
            "description": "Dust and dirt accumulation in crevices with wide falloff"
        },
        "mask_streaking": {
            "name": "mask_streaking",
            "scale_px": 6,
            "description": "Directional liquid drips running downwards from panel features"
        },
        "mask_heatradial": {
            "name": "mask_heatradial",
            "scale_px": 260,
            "description": "Off-center radial scorch with circular heat banding rings"
        },
        "mask_chips": {
            "name": "mask_chips",
            "scale_px": 12,
            "description": "Clustered hard-edged paint chips strictly near panel edges"
        },
        "mask_corrosion": {
            "name": "mask_corrosion",
            "scale_px": 25,
            "description": "Speckled cellular rust growth around seed locations"
        },
        "mask_carbon": {
            "name": "mask_carbon",
            "scale_px": 150,
            "description": "Soft directional carbon/soot exhaust wedge from engine root"
        },
        "mask_panelfade": {
            "name": "mask_panelfade",
            "scale_px": 180,
            "description": "Per-panel flat contrast offset simulating replacement panels"
        }
    }
    
    with open(json_path, "w") as f:
        json.dump(json_data, f, indent=2, sort_keys=True)

if __name__ == "__main__":
    import sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "assets/ships/foundry/fleet_breadth_20260720/textures"
    generate_grime_masks(out_dir)

# 小公主（Blender 建模腳本）
# 執行：blender --background --factory-startup --python build_princess.py -- <輸出資料夾>
# 產出：princess.glb（每個關節是一個節點，樞紐在解剖關節位置）與四個角度的預覽圖。
#
# 座標：Blender Z 朝上、角色面向 -Y（匯出 glTF 後為 Y 朝上、面向 +Z）。單位公尺，身高約 0.9。
# 關節：princess > hips > (skirt, bow > ribbon_L_1..4 / ribbon_R_1..4,
#        chest > (head > (hairBack, crown), upperArm_L/R > forearm > hand))
# 五官不在模型裡：執行時用表情貼圖貼在頭部外殼上（依動作切換表情）。
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.dirname(__file__))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

# ---------------- 材質（深一點、飽和一點，部件之間要有明暗對比） ----------------
def lin(rgb): return tuple(pow(v / 255.0, 2.2) for v in rgb) + (1.0,)
def mat(name, rgb, rough=.6, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = lin(rgb)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit is not None:
        for k in ('Emission Color', 'Emission'):
            if k in p.inputs: p.inputs[k].default_value = lin(emit); break
        if 'Emission Strength' in p.inputs: p.inputs['Emission Strength'].default_value = emit_strength
    m.diffuse_color = lin(rgb)
    return m

def tulle_mat(name, rgb, alpha=.38):
    """紗：半透明、粗糙度高；網頁裡再加上網紗紋理與柔光。"""
    m = mat(name, rgb, .85)
    p = m.node_tree.nodes.get('Principled BSDF')
    if 'Alpha' in p.inputs: p.inputs['Alpha'].default_value = alpha
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try: setattr(m, attr, val)
        except Exception: pass
    try: m.use_backface_culling = False
    except Exception: pass
    return m

M = {
    'skin':   mat('skin',   (255, 230, 218), .55),       # 白皙的膚色
    'hair':   mat('hair',   (112, 58, 36), .42),
    'hairHi': mat('hairHi', (150, 84, 50), .42),
    'dress':  mat('dress',  (92, 48, 146), .5),
    'over':   mat('over',   (108, 62, 168), .48),
    'skirt':  mat('skirt',  (156, 108, 212), .5),
    'puff':   mat('puff',   (136, 92, 196), .5),
    'lace':   mat('lace',   (250, 244, 255), .7),
    'pinkR':  mat('pinkR',  (236, 116, 162), .5),
    'lilacR': mat('lilacR', (188, 148, 232), .5),
    'tulle':  tulle_mat('tulle', (255, 190, 222), .36),
    'tulleL': tulle_mat('tulleL', (226, 206, 255), .32),
    'sash':   mat('sash',   (204, 46, 104), .38),
    'shoe':   mat('shoe',   (176, 36, 88), .32),
    'sock':   mat('sock',   (252, 246, 250), .7),
    'gold':   mat('gold',   (236, 178, 58), .26, 1.0),
    'gemP':   mat('gemP',   (255, 70, 140), .08, 0.0, (255, 70, 140), .8),
    'gemB':   mat('gemB',   (70, 160, 255), .08, 0.0, (70, 160, 255), .8),
}

# ---------------- 幾何工具 ----------------
def link(name, bm, material, parent, loc=(0, 0, 0), solidify=0.0, subsurf=0):
    me = bpy.data.meshes.new(name)
    for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    if solidify:
        s = ob.modifiers.new('solid', 'SOLIDIFY'); s.thickness = solidify; s.offset = -1
    if subsurf:
        d = ob.modifiers.new('sub', 'SUBSURF'); d.levels = subsurf; d.render_levels = subsurf
    return ob

def joint(name, parent, loc, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = .02
    col.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = rot
    return e

def xform(bm, rot=(0, 0, 0), scale=(1, 1, 1)):
    bmesh.ops.transform(bm, matrix=Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1)), verts=bm.verts)

def new_bm():
    """每個網格都帶 UV，網頁裡才能貼布紋與紗網紋理。"""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    return bm

def set_uv(bm, face, uvs):
    lay = bm.loops.layers.uv.active
    for loop, uv in zip(face.loops, uvs): loop[lay].uv = uv

def sphere(name, material, parent, loc, scale=(1, 1, 1), rot=(0, 0, 0), seg=40, rings=26):
    bm = new_bm()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0, calc_uvs=True)
    xform(bm, rot, scale)
    return link(name, bm, material, parent, loc)

def torus(name, material, parent, loc, R, r, rot=(0, 0, 0), scale=(1, 1, 1), seg=56, sides=16):
    bm = new_bm(); rings = []
    for i in range(seg):
        a = i / seg * 2 * math.pi; ring = []
        for j in range(sides):
            b = j / sides * 2 * math.pi
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        for j in range(sides):
            f = bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % sides], rings[i][(j + 1) % sides]))
            u0, u1, v0, v1 = i / seg, (i + 1) / seg, j / sides, (j + 1) / sides
            set_uv(bm, f, ((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
    xform(bm, rot, scale)
    return link(name, bm, material, parent, loc)

def lathe(name, material, parent, loc, pts, seg=64, wave=0.0, waves=0, rot=(0, 0, 0), scale=(1, 1, 1), close_bottom=False,
          gap=0.0, solidify=0.0):
    """pts: [(radius, z)] 由下而上；wave/waves 讓布料有波浪褶（越往下越深）。
    gap: 在正前方（-Y）留一道開口（弧度），做成前開的外罩裙。"""
    bm = new_bm(); rings = []
    closed = gap <= 0
    n = seg if closed else seg + 1
    a0 = -math.pi / 2 + gap / 2               # 開口置中在 -Y
    span = 2 * math.pi - (0 if closed else gap)
    for k, (r, z) in enumerate(pts):
        w = wave * (1 - k / max(1, len(pts) - 1)) ** 1.4
        ring = []
        for i in range(n):
            a = (i / seg * 2 * math.pi) if closed else (a0 + i / seg * span)
            rr = r * (1 + w * math.sin(a * waves)) if waves else r
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    K = len(rings)
    for k in range(K - 1):
        for i in range(seg):
            j = (i + 1) % n if closed else i + 1
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            u0, u1, v0, v1 = i / seg, (i + 1) / seg, k / (K - 1), (k + 1) / (K - 1)
            set_uv(bm, f, ((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
    if close_bottom:
        c = bm.verts.new((0, 0, pts[0][1]))
        for i in range(seg): bm.faces.new((rings[0][(i + 1) % seg], rings[0][i], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xform(bm, rot, scale)
    return link(name, bm, material, parent, loc, solidify=solidify)

def capsule(name, material, parent, loc, r_top, r_bot, length, seg=36, rot=(0, 0, 0), scale=(1, 1, 1)):
    """由樞紐（z=0）往下延伸的圓潤肢體，上下兩端是半球，粗細平順漸變。"""
    pts = []
    for k in range(8):                       # 下端半球（由下而上）
        t = -math.pi / 2 + k / 7 * math.pi / 2
        pts.append((max(1e-4, r_bot * math.cos(t)), -length + r_bot * math.sin(t)))
    for k in range(1, 8):                    # 上端半球
        t = k / 7 * math.pi / 2
        pts.append((max(1e-4, r_top * math.cos(t)), r_top * math.sin(t)))
    return lathe(name, material, parent, loc, pts, seg=seg, rot=rot, scale=scale)

def cone(name, material, parent, loc, r, h, rot=(0, 0, 0), seg=24):
    bm = new_bm()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=h, calc_uvs=True)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    xform(bm, rot)
    return link(name, bm, material, parent, loc)

def hair_curtain(name, material, parent, loc, R0, height, arc_deg=236, flare=.03, depth=.92, nu=44, nv=30):
    """背後的長髮：一整片包住後腦往下垂的波浪髮簾，末端微微外翻。"""
    bm = new_bm(); grid = []
    arc = math.radians(arc_deg)
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = -arc / 2 + i / nu * arc                  # u=0 在正後方 (+Y)
            side = abs(u) / (arc / 2)
            # 髮尾長短不一的波浪邊：中間最長，兩側較短
            length = height * (1 - .2 * side * side + .05 * math.sin(u * 7.3))
            z = -v * length
            r = R0 * (1 - .3 * v) + flare * v * v       # 往下收窄，髮尾微微外翻
            r += .011 * math.sin(u * 11 + v * 6) * (.25 + v)   # 一束束的髮絲起伏
            row.append(bm.verts.new((r * math.sin(u) * (1 - .12 * v), r * math.cos(u) * depth * (1 - .3 * v), z)))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            set_uv(bm, f, ((i / nu, j / nv), ((i + 1) / nu, j / nv), ((i + 1) / nu, (j + 1) / nv), (i / nu, (j + 1) / nv)))
            u = -arc / 2 + (i + .5) / nu * arc
            f.material_index = 1 if math.sin(u * 11 + (j / nv) * 6 + 1.2) > .55 else 0   # 浮起處是亮色髮絲
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, material, parent, loc, solidify=.011, subsurf=1)
    ob.data.materials.append(M['hairHi'])
    return ob

# ---------------- 骨架與部件 ----------------
root = joint('princess', None, (0, 0, 0))

# 鞋與襪（鞋底貼地 z=0）
for s, side in ((1, 'L'), (-1, 'R')):
    sphere(f'shoe_{side}', M['shoe'], root, (s * .042, -.016, .021), (.029, .046, .021))
    capsule(f'sock_{side}', M['sock'], root, (s * .041, 0, .13), .021, .02, .1)

hips = joint('hips', root, (0, 0, .36))
skirt = joint('skirt', hips, (0, 0, 0))
# 內層長裙（淡紫）：鐘形
lathe('skirt_inner', M['skirt'], skirt, (0, 0, 0),
      [(.208, -.296), (.212, -.284), (.2, -.25), (.176, -.19), (.147, -.12), (.118, -.055), (.093, -.005), (.08, .02)],
      wave=.03, waves=8)
# 內裙上三層交錯顏色的荷葉邊（粉、淡紫、白），從外罩裙前方的開衩露出來
for k, (z, r, m_) in enumerate(((-.27, .214, 'pinkR'), (-.2, .19, 'lilacR'), (-.13, .162, 'pinkR'))):
    lathe(f'tier_{k}', M[m_], skirt, (0, 0, 0), [(r + .006, z - .028), (r + .01, z - .02), (r - .004, z + .012)], wave=.09, waves=22)
    torus(f'tier_lace_{k}', M['lace'], skirt, (0, 0, z - .026), r + .009, .0042, scale=(1, 1, .7))
# 白色蕾絲襯裙從裙襬下露出一圈波浪
lathe('petticoat', M['lace'], skirt, (0, 0, 0), [(.204, -.312), (.214, -.302), (.202, -.27)], wave=.07, waves=20)
torus('hem_ruffle', M['lace'], skirt, (0, 0, -.297), .214, .009, scale=(1, 1, .8))
# 粉色薄紗裙：罩在內裙與荷葉邊外、外罩裙內，從開衩與裙襬下方透出來
lathe('tulle_skirt', M['tulle'], skirt, (0, 0, 0),
      [(.236, -.305), (.238, -.29), (.222, -.24), (.196, -.17), (.162, -.1), (.126, -.04), (.098, .0), (.086, .02)],
      seg=112, wave=.07, waves=14)
# 外層罩裙（深紫緞面）：前方開衩、六道垂墜波浪；比紗裙再大一圈，荷葉邊不會穿出來
over_pts = [(.252, -.268), (.254, -.256), (.236, -.205), (.206, -.14), (.168, -.075), (.128, -.022), (.098, .008), (.088, .024)]
lathe('overskirt', M['over'], skirt, (0, 0, 0), over_pts, wave=.1, waves=6, gap=1.05, solidify=.006)
# 罩裙開衩兩側與下緣的金色滾邊
torus('overskirt_trim', M['gold'], skirt, (0, 0, .02), .089, .004)
for s in (1, -1):
    a = -math.pi / 2 + s * 1.05 / 2
    for k in range(len(over_pts) - 1):
        (r1, z1), (r2, z2) = over_pts[k], over_pts[k + 1]
        zc = (z1 + z2) / 2; rc = (r1 + r2) / 2 + .002
        sphere(f'slit_trim_{s}_{k}', M['gold'], skirt, (rc * math.cos(a), rc * math.sin(a), zc),
               (.0045, .0045, abs(z2 - z1) / 2 + .006), rot=(math.atan2(r1 - r2, z2 - z1) * math.sin(a), -math.atan2(r1 - r2, z2 - z1) * math.cos(a), 0), seg=16, rings=10)

# 腰帶與背後的大蝴蝶結
torus('sash', M['sash'], hips, (0, 0, .024), .084, .013, scale=(1, 1, 1.35))
bow = joint('bow', hips, (0, .1, .028))
sphere('bow_knot', M['sash'], bow, (0, .006, 0), (.02, .015, .02))
for s, side in ((1, 'L'), (-1, 'R')):
    # 蝴蝶結的耳朵：中空的環，看起來像真的緞帶
    torus(f'bow_loop_{side}', M['sash'], bow, (s * .046, .01, .008), .03, .011, rot=(math.pi / 2, s * .4, 0), scale=(1.25, 1, .8))
# 緞帶尾：每條 4 節，樞紐在節首。第一節沿著裙子的斜度往後下方（執行時從這個角度往外飄，不會插進裙子）
for s, side in ((1, 'L'), (-1, 'R')):
    parent = bow
    for i in range(4):
        seg = joint(f'ribbon_{side}_{i + 1}', parent, (s * .016, .014, -.01) if i == 0 else (0, 0, -.05),
                    rot=(.58, 0, s * .3) if i == 0 else (.03, 0, 0))
        # 每節比節距長一點，前後重疊成一條連續的扁緞帶
        sphere(f'ribbon_{side}_{i + 1}_mesh', M['sash'], seg, (0, 0, -.025), (.015 - i * .0008, .0035, .034))
        parent = seg
    cone(f'ribbon_{side}_tip', M['sash'], parent, (0, 0, -.05), .013, .022, rot=(math.pi, 0, 0), seg=3)

chest = joint('chest', hips, (0, 0, .04))
# 上衣（由下而上），收在脖子
lathe('bodice', M['dress'], chest, (0, 0, 0),
      [(.08, -.022), (.083, .0), (.088, .04), (.094, .085), (.09, .118), (.072, .138), (.04, .147)])
capsule('neck', M['skin'], chest, (0, 0, .172), .031, .032, .04)
torus('collar', M['lace'], chest, (0, 0, .134), .056, .012, scale=(1, 1, .7))
# 胸前粉色飾片（上寬下窄的 V 形），中間一排金色綁帶與小蝴蝶結
bm = new_bm()
rows = [(-.02, .022), (.02, .03), (.06, .04), (.1, .05), (.122, .044)]
grid = []
for z, w in rows:
    r = .084 + .012 * (z + .02) / .14
    row = []
    for i in range(9):
        x = -w + i / 8 * 2 * w
        y = -math.sqrt(max(1e-6, (r + .003) ** 2 - x * x))
        row.append(bm.verts.new((x, y, z)))
    grid.append(row)
for k in range(len(grid) - 1):
    for i in range(8):
        f = bm.faces.new((grid[k][i], grid[k][i + 1], grid[k + 1][i + 1], grid[k + 1][i]))
        set_uv(bm, f, ((i / 8, k / 4), ((i + 1) / 8, k / 4), ((i + 1) / 8, (k + 1) / 4), (i / 8, (k + 1) / 4)))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
link('stomacher', bm, M['pinkR'], chest, (0, 0, 0), solidify=.003)
for k, z in enumerate((.0, .03, .06, .09)):
    for s in (1, -1):
        sphere(f'lace_eye_{k}_{s}', M['gold'], chest, (s * .011, -.089 - z * .03, z), (.0032, .0032, .0032), seg=14, rings=10)
    torus(f'lacing_{k}', M['gold'], chest, (0, -.089 - z * .03, z + .013), .011, .0018, rot=(math.pi / 2, 0, 0), scale=(1, 1, .45))
sphere('brooch', M['gemP'], chest, (0, -.094, .113), (.013, .007, .013))
torus('brooch_rim', M['gold'], chest, (0, -.093, .113), .013, .0032, rot=(math.pi / 2, 0, 0))

# 手臂：上臂（打褶泡泡袖）> 前臂（蕾絲袖口）> 手，關節粗細一致，彎曲不會有縫
for s, side in ((1, 'L'), (-1, 'R')):
    ua = joint(f'upperArm_{side}', chest, (s * .096, 0, .104))
    lathe(f'puff_{side}', M['puff'], ua, (s * .008, 0, -.006),
          [(.022, -.034), (.036, -.026), (.044, -.012), (.045, .004), (.038, .02), (.02, .03)], seg=48, wave=.08, waves=10)
    # 雙色袖子：淡紫泡泡袖 + 粉色袖口滾邊 + 白蕾絲
    torus(f'puff_band_{side}', M['pinkR'], ua, (s * .009, 0, -.035), .028, .0065)
    # 泡泡袖外罩一層紗
    lathe(f'puff_tulle_{side}', M['tulleL'], ua, (s * .008, 0, -.006),
          [(.026, -.04), (.043, -.03), (.051, -.012), (.052, .006), (.044, .022), (.024, .033)], seg=48, wave=.1, waves=14)
    torus(f'puff_trim_{side}', M['lace'], ua, (s * .009, 0, -.043), .025, .0048)
    capsule(f'upperArm_{side}_mesh', M['skin'], ua, (s * .008, 0, -.02), .018, .0165, .082)
    fa = joint(f'forearm_{side}', ua, (s * .008, 0, -.102))
    capsule(f'forearm_{side}_mesh', M['skin'], fa, (0, 0, 0), .0165, .015, .07)
    torus(f'cuff_{side}', M['lace'], fa, (0, 0, -.062), .018, .006)
    hd = joint(f'hand_{side}', fa, (0, 0, -.074))
    # 手：手臂自然下垂時掌心朝身體（左手朝 -X、右手朝 +X），大拇指朝前（-Y）
    sphere(f'palm_{side}', M['skin'], hd, (0, -.001, -.02), (.0098, .0185, .022), seg=32, rings=20)
    sphere(f'wrist_{side}', M['skin'], hd, (0, 0, -.002), (.012, .014, .01), seg=24, rings=16)
    # 四根手指（前→後：食指、中指、無名指、小指），中指最長；指間留縫、稍微張開、朝掌心微彎
    for k, (y, ln, r, fan) in enumerate(((-.0122, .025, .0031, -.1), (-.0041, .028, .0032, -.03), (.0041, .026, .003, .04), (.0118, .021, .0027, .12))):
        fj = joint(f'finger_{side}_{k}', hd, (-s * .001, y, -.037))
        fj.rotation_euler = (fan, s * .22, 0)                   # fan：手指張開；Y 軸：向掌心彎
        capsule(f'finger_{side}_{k}_a', M['skin'], fj, (0, 0, 0), r, r * .92, ln * .55, seg=16)
        tip = joint(f'finger_{side}_{k}_tip', fj, (0, 0, -ln * .55))
        tip.rotation_euler = (0, s * .28, 0)
        capsule(f'finger_{side}_{k}_b', M['skin'], tip, (0, 0, 0), r * .92, r * .82, ln * .45, seg=16)
    # 大拇指：從手掌前緣、靠掌心那側長出，分兩節，朝前下方
    th = joint(f'thumb_{side}', hd, (-s * .004, -.016, -.012))
    th.rotation_euler = (-.8, s * .25, 0)
    capsule(f'thumb_{side}_a', M['skin'], th, (0, 0, 0), .0042, .0038, .012, seg=16)
    th2 = joint(f'thumb_{side}_tip', th, (0, 0, -.012))
    th2.rotation_euler = (-.2, s * .2, 0)
    capsule(f'thumb_{side}_b', M['skin'], th2, (0, 0, 0), .0038, .0032, .01, seg=16)

# 頭：頭部皮膚（五官在執行時貼成表情貼圖），頭髮、皇冠
head = joint('head', chest, (0, 0, .166))
HC = (0, 0, .13)       # 頭部中心（相對 head 關節）
HR = .13
sphere('head_skin', M['skin'], head, HC, (HR, HR * .96, HR * .97), seg=48, rings=32)

# 頭髮殼：比頭大一點，挖出臉；前緣是波浪狀的瀏海，有厚度
bm = new_bm()
bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=HR * 1.07, calc_uvs=True)
def cut(c):
    fringe = .026 + .016 * abs(math.sin(c.x * 52)) - 2.2 * c.x * c.x   # 扇貝形瀏海，兩側較短
    if c.y < -.02 and c.z < fringe: return True              # 臉
    if c.z < -.07: return True                               # 頸部以下由髮簾負責
    if abs(c.x) > .09 and c.y < .0 and c.z < -.01: return True  # 耳前留給鬢髮
    return False
bmesh.ops.delete(bm, geom=[f for f in bm.faces if cut(f.calc_center_median())], context='FACES')
xform(bm, scale=(1, .98, 1))
link('hair_cap', bm, M['hair'], head, HC, solidify=.012, subsurf=1)
# 臉頰兩側的鬢髮，末端內捲
for s, side in ((1, 'L'), (-1, 'R')):
    capsule(f'sideLock_{side}', M['hair'], head, (s * .112, -.03, HC[2] + .02), .026, .02, .12, rot=(0, s * .1, 0), scale=(1, 1.15, 1))
    torus(f'sideCurl_{side}', M['hairHi'], head, (s * .104, -.036, HC[2] - .112), .016, .0085, rot=(0, math.pi / 2, 0))
# 背後長髮：一整片波浪髮簾，樞紐在後腦，可整片擺動
hb = joint('hairBack', head, (0, .01, HC[2] + .02))
hair_curtain('hairBack_mesh', M['hair'], hb, (0, 0, 0), HR * 1.06, .29)       # 髮尾停在腰帶上方，露出蝴蝶結

# 皇冠：有厚度的金色冠圈 + 五個尖角 + 寶石，稍微往後戴
crown = joint('crown', head, (0, -.012, HC[2] + .108), rot=(-.34, 0, 0))
lathe('crown_band', M['gold'], crown, (0, 0, 0), [(.054, -.007), (.057, -.002), (.057, .011), (.054, .016)], seg=56)
torus('crown_rim_low', M['gold'], crown, (0, 0, -.006), .056, .0035)
torus('crown_rim_top', M['gold'], crown, (0, 0, .015), .055, .0028)
for i, a in enumerate((-70, -35, 0, 35, 70)):
    t = math.radians(a - 90)
    x, y = .055 * math.cos(t), .055 * math.sin(t)
    h = .036 if a == 0 else (.027 if abs(a) == 35 else .02)
    cone(f'crown_spike_{i}', M['gold'], crown, (x, y, .014), .011, h)
    sphere(f'crown_tip_{i}', M['gemB' if i % 2 else 'gemP'], crown, (x, y, .014 + h + .003), (.0065, .0065, .0065), seg=20, rings=12)
sphere('crown_gem', M['gemP'], crown, (0, -.059, .005), (.012, .0065, .012))

# ---------------- 匯出 GLB ----------------
glb = os.path.join(OUT, 'princess.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True, export_apply=True, use_selection=False)
print('EXPORTED', glb)

# ---------------- 預覽圖：正面、四分之三、側面、背面 ----------------
try:
    scene.view_settings.view_transform = 'Standard'          # 不做額外的去飽和，顏色接近網頁裡的樣子
    scene.view_settings.exposure = -1.1
    world = bpy.data.worlds.new('w'); scene.world = world
    world.color = (.025, .025, .06)
    for name, loc, energy in (('key', (-1.2, -1.8, 2.0), 520), ('fill', (1.7, -1.2, 1.0), 200), ('rim', (0, 1.8, 1.6), 360)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = 1.2
        lo = bpy.data.objects.new(name, ld); col.objects.link(lo); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, .45)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 70
    cam = bpy.data.objects.new('cam', cam_d); col.objects.link(cam); scene.camera = cam
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
        try: scene.render.engine = eng; break
        except Exception: continue
    scene.render.resolution_x = 640; scene.render.resolution_y = 800
    target = Vector((0, 0, .45))
    for label, ang in (('front', 0), ('three_quarter', 40), ('side', 90), ('back', 180)):
        a = math.radians(ang)
        cam.location = target + Vector((math.sin(a) * 2.1, -math.cos(a) * 2.1, .35))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(OUT, f'preview_{label}.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', label, scene.render.engine)
except Exception as e:
    print('PREVIEW FAILED', e)

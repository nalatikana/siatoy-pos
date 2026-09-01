/* ข้อมูลตั้งต้นสำหรับทดลองใช้ก่อนต่อฐานข้อมูลจริง
 * ยกมาจากเดโม เพื่อให้เปิดแอปแล้วมีของให้ยิงบาร์โค้ดเล่นได้ทันที
 * เมื่อต่อ Supabase แล้ว ข้อมูลชุดนี้จะถูกแทนที่ด้วยของจริงจากการนับสต๊อกวันตัดยอด
 */
export const SEED_LOCATIONS = [
  { id: 'loc-shop',  code: 'SHOP',   name: 'หน้าร้าน',              kind: 'shop'  },
  { id: 'loc-fest',  code: 'FEST01', name: 'บูธ Bangkok TCG Fest',  kind: 'event' },
];

export const SEED_VENDORS = [
  { id: 'ven-001', code: '001', name: 'ร้านพี่โจ้ การ์ดสะสม', tel: '081-234-5678', commission_pct: 15 },
  { id: 'ven-002', code: '002', name: 'คุณเบียร์ (นักสะสม)',   tel: '089-777-1122', commission_pct: 20 },
  { id: 'ven-003', code: '003', name: 'Siatoy TCG (ของร้านเอง)', tel: '-',          commission_pct: 0  },
  { id: 'ven-004', code: '004', name: 'น้องมิ้นท์ Card Shop',   tel: '092-555-8899', commission_pct: 12 },
];

export const SEED_SETS = [
  { id: 'set-sv8a', code: 'SV8a', name: 'Terastal Festival (SV8a)', game: 'Pokémon'  },
  { id: 'set-sv9',  code: 'SV9',  name: 'Battle Partners (SV9)',    game: 'Pokémon'  },
  { id: 'set-op09', code: 'OP09', name: 'One Piece OP-09',          game: 'One Piece'},
  { id: 'set-acc',  code: 'ACC',  name: 'อุปกรณ์เสริม',              game: '-'        },
  { id: 'set-grd',  code: 'GRD',  name: 'การ์ดแยกใบ / Graded',       game: '-'        },
];

const P = (sku, name, category, set_id, vendor_id, cost, price, stock, icon, is_single) =>
  ({ id: 'prd-' + sku, sku, name, category, set_id, vendor_id, cost, price, stock, icon,
     is_single: !!is_single, is_active: true, vat_rate: 0 });

export const SEED_PRODUCTS = [
  P('8859001','Pokémon SV8a Terastal Festival · Booster Box','Booster Box','set-sv8a','ven-003',4200,5490,6,'📦'),
  P('8859002','Pokémon SV8a · Booster Pack (ซองสุ่ม)','Booster Pack','set-sv8a','ven-003',140,199,112,'🎴'),
  P('8859003','Pokémon SV9 Battle Partners · Booster Box','Booster Box','set-sv9','ven-001',3900,4990,3,'📦'),
  P('8859004','Pokémon SV9 · Booster Pack','Booster Pack','set-sv9','ven-001',130,180,86,'🎴'),
  P('8859005','One Piece OP-09 · Booster Box (JP)','Booster Box','set-op09','ven-002',2600,3490,4,'📦'),
  P('8859006','One Piece OP-09 · Booster Pack','Booster Pack','set-op09','ven-002',110,159,64,'🎴'),
  P('8859007','Pikachu ex SAR · PSA 10','การ์ดแยกใบ','set-grd','ven-002',12000,18900,1,'✨',true),
  P('8859008','Charizard ex SIR · SV3a (ใบเปล่า)','การ์ดแยกใบ','set-grd','ven-004',5200,7900,2,'🔥',true),
  P('8859009','Luffy Leader Parallel OP-09','การ์ดแยกใบ','set-grd','ven-004',1800,2790,3,'🏴‍☠️',true),
  P('8859010','Sleeve Ultra Pro 66x91 (100 ซอง)','อุปกรณ์','set-acc','ven-003',95,189,48,'🛡️'),
  P('8859011','Deck Box Dragon Shield · ดำ','อุปกรณ์','set-acc','ven-003',180,350,22,'🗃️'),
  P('8859012','Playmat Siatoy TCG (Limited)','อุปกรณ์','set-acc','ven-003',220,490,15,'🟨'),
  P('8859013','Toploader 35pt (25 ชิ้น)','อุปกรณ์','set-acc','ven-003',60,120,9,'📄'),
  P('8859014','Pokémon SV8a · Elite Trainer Box','ETB','set-sv8a','ven-001',1450,1990,5,'🎁'),
  P('8859015','One Piece OP-09 · Starter Deck ST-21','Starter','set-op09','ven-002',390,590,11,'🃏'),
  P('8859016','Booster Bundle SV9 (6 ซอง)','Bundle','set-sv9','ven-001',780,1090,7,'🎒'),
];

export const SEED_MEMBERS = [
  { id: 'mem-001', code: 'M001', name: 'คุณต้น',   tel: '0891234567', points: 1240, tier: 'ทอง',   total_spend: 82400 },
  { id: 'mem-002', code: 'M002', name: 'คุณแบงค์', tel: '0812223344', points: 380,  tier: 'เงิน',  total_spend: 19800 },
  { id: 'mem-003', code: 'M003', name: 'คุณฟิล์ม', tel: '0955556677', points: 96,   tier: 'ทั่วไป', total_spend: 5400  },
];

export const CATEGORIES = ['Booster Box','Booster Pack','การ์ดแยกใบ','อุปกรณ์','ETB','Starter','Bundle'];

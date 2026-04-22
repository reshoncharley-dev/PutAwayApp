import React, { useState, useRef, useEffect, useCallback, useMemo, memo, useDeferredValue } from "react";
import Papa from "papaparse";
import * as GSheets from "./GoogleSheetsService";
import {
  Card, Text, Title, Button, TextInput, Select, Group, Stack, Badge,
  Progress, Paper, Divider, FileInput, Alert, ActionIcon, Collapse,
  Tooltip, SimpleGrid, Box, Loader, Switch, Modal, ScrollArea,
  ThemeIcon, useMantineColorScheme, useComputedColorScheme,
} from "@mantine/core";
import {
  IconCheck, IconX, IconSearch, IconDownload, IconRefresh, IconRoute,
  IconWalk, IconClipboardList, IconUpload,
  IconAlertTriangle, IconCloudUpload, IconChevronDown,
  IconFileSpreadsheet, IconTrash, IconPackage, IconSun, IconMoon,
} from "@tabler/icons-react";

// ============================================================
// Types
// ============================================================
interface ShelfEntry { org: string; side: string; pos: number; aliases?: string[]; }
interface WarehouseZone { id: string; name: string; section: string; order: number; color: string; shelves: ShelfEntry[]; }
interface ZoneEntry { zone: WarehouseZone; shelfPos: number; side: string; }
interface InventoryItem { _id: string; _rowIndex: number; [key: string]: unknown; }
interface PickItem extends InventoryItem { _shelfPos: number; _shelfSide: string; _pickItemKey: string; _notHere?: boolean; _orderIdx?: number; _origIdx?: number; }
interface PickRunZone { zoneId: string; zoneName: string; section: string; order: number; color: string; items: PickItem[]; unfoundCount?: number; _autoCompleted?: boolean; _sinkToBottom?: boolean; }
interface PickRunDataType { zones: PickRunZone[]; unmapped: InventoryItem[]; }
interface SavedState { inventoryList: InventoryItem[]; csvFileName: string; foundCount: number; foundIds: string[]; notFoundIds: string[]; detectedColumns: Record<string, string>; organizations: string[]; pickRunData: PickRunDataType | null; notHereItems: Record<string, boolean>; deployReasonFilter: string; googleSheetId?: string; googleSheetTitle?: string; googleSheetTab?: string; googleSyncEnabled?: boolean; }
interface GoogleSheetsState { isSignedIn: boolean; isConnected: boolean; isLoading: boolean; error: string; spreadsheetId: string; spreadsheetTitle: string; sheetTab: string; sheetTabs: GSheets.SheetInfo[]; realtimeSync: boolean; recentSpreadsheets: Array<{ id: string; name: string; modifiedTime: string }>; showSetup: boolean; clientId: string; sheetHeaders: string[]; foundColumnIndex: number; }

// ============================================================
// Constants
// ============================================================
const STORAGE_KEY = "inventoryScanner_savedState";
const VIBRATE_DURATION = 200;

// ============================================================
// WAREHOUSE ZONE MAP
// ============================================================
const WAREHOUSE_ZONES: WarehouseZone[] = [
  { id: "Z1", name: "Aisle 1", section: "Column 1", order: 1, color: "#991b1b", shelves: [{ org: "OneTrust", side: "-", pos: 1 },{ org: "BDS", side: "-", pos: 2 },{ org: "Anyscale", side: "-", pos: 3 },{ org: "Staffbase", side: "-", pos: 4 },{ org: "Velocity", side: "-", pos: 5 },{ org: "Phaidra", side: "-", pos: 6 },{ org: "Sysdig", side: "-", pos: 7 }] },
  { id: "Z2", name: "Aisle 2", section: "Column 2", order: 2, color: "#ef4444", shelves: [{ org: "MathCo", side: "-", pos: 1 },{ org: "QbDVision", side: "-", pos: 2 },{ org: "TrueAnom", side: "-", pos: 3 },{ org: "JumpCloud", side: "-", pos: 4 },{ org: "Crisis24", side: "-", pos: 5 },{ org: "Stack Overflow", side: "-", pos: 6, aliases: ["StackOverflow"] },{ org: "SandboxAQ", side: "-", pos: 7 }] },
  { id: "Z3", name: "Aisle 3", section: "Column 3", order: 3, color: "#f97316", shelves: [{ org: "Fabulous", side: "-", pos: 1 },{ org: "Int. Growth", side: "-", pos: 2, aliases: ["International Growth"] },{ org: "Movable Ink", side: "-", pos: 3 },{ org: "Kleiner Perk", side: "-", pos: 4, aliases: ["Kleiner Perkins"] },{ org: "ShopMonkey", side: "-", pos: 5 },{ org: "StackAdapt", side: "-", pos: 6 },{ org: "NewRelic", side: "-", pos: 7, aliases: ["New Relic"] },{ org: "Verve", side: "-", pos: 8 },{ org: "Torchlight", side: "-", pos: 9 },{ org: "TaxJar", side: "-", pos: 10 },{ org: "Energy Found", side: "-", pos: 11, aliases: ["Energy Foundation", "Energy Found.", "Energy Found."] }] },
  { id: "Z4", name: "Aisle 4", section: "Column 4", order: 4, color: "#eab308", shelves: [{ org: "Single Grain", side: "-", pos: 1 },{ org: "SnapCare", side: "-", pos: 2 },{ org: "Sidecar Heath", side: "-", pos: 3, aliases: ["Sidecar", "Sidecar Health"] },{ org: "Sift", side: "-", pos: 4 },{ org: "SoRare", side: "-", pos: 5, aliases: ["Sorare"] },{ org: "Synthesia", side: "-", pos: 6 }] },
  { id: "Z5", name: "Aisle 5", section: "Column 5", order: 5, color: "#22c55e", shelves: [{ org: "OpenSesame", side: "-", pos: 1 },{ org: "Astronomer", side: "-", pos: 2 },{ org: "Primer", side: "-", pos: 3 },{ org: "Productboard", side: "-", pos: 4 },{ org: "Wise", side: "-", pos: 5 },{ org: "Railbookers", side: "-", pos: 6 }] },
  { id: "Z6", name: "Aisle 6", section: "Column 6", order: 6, color: "#06b6d4", shelves: [{ org: "Neo4j", side: "-", pos: 1 },{ org: "SOCI", side: "-", pos: 2 },{ org: "Lokalise", side: "-", pos: 3 },{ org: "Earnest Ana.", side: "-", pos: 4, aliases: ["Earnest", "Earnest Analytics"] },{ org: "Moonpay", side: "-", pos: 5, aliases: ["MoonPay"] },{ org: "Nylas", side: "-", pos: 6 },{ org: "Pacvue", side: "-", pos: 7 },{ org: "Tailscale", side: "-", pos: 8 },{ org: "Archer Faris", side: "-", pos: 9, aliases: ["Archer"] },{ org: "Mysten", side: "-", pos: 10 },{ org: "Nanoramic", side: "-", pos: 11 }] },
  { id: "Z7", name: "Aisle 7", section: "Column 7", order: 7, color: "#8b5cf6", shelves: [{ org: "Pax8", side: "-", pos: 1 },{ org: "HackerOne", side: "-", pos: 2 },{ org: "Varo Bank", side: "-", pos: 3 }] },
  { id: "Z8", name: "Aisle 8", section: "Column 8", order: 8, color: "#ec4899", shelves: [{ org: "Varo Bank", side: "-", pos: 1 },{ org: "Houzz", side: "-", pos: 2 },{ org: "FirstBase", side: "-", pos: 3 },{ org: "Dotdigital", side: "-", pos: 4 },{ org: "Finfare", side: "-", pos: 5 },{ org: "AppDirect", side: "-", pos: 6 }] },
  { id: "Z9", name: "Aisle 9", section: "Column 9", order: 9, color: "#d946ef", shelves: [{ org: "Mercari", side: "-", pos: 1 },{ org: "8th Light", side: "-", pos: 2 },{ org: "Kallidus", side: "-", pos: 3 },{ org: "3Cloud", side: "-", pos: 4 }] },
  { id: "Z10", name: "Aisle 10", section: "Column 10", order: 10, color: "#0ea5e9", shelves: [{ org: "Pantheon", side: "-", pos: 1 },{ org: "Anaplan", side: "-", pos: 2 },{ org: "Crosby Legal", side: "-", pos: 3 },{ org: "Papa", side: "-", pos: 4 }] },
  { id: "Z11", name: "Aisle 11", section: "Column 11", order: 11, color: "#64748b", shelves: [{ org: "HackerRank", side: "-", pos: 1 },{ org: "BGB", side: "-", pos: 2 },{ org: "Paxos", side: "-", pos: 3 },{ org: "SpotOn", side: "-", pos: 4 },{ org: "Rithum", side: "-", pos: 5 },{ org: "ZenBusiness", side: "-", pos: 6, aliases: ["ZenB."] },{ org: "A16Z", side: "-", pos: 7 }] },
  { id: "Z12", name: "Aisle 12", section: "Column 12", order: 12, color: "#a3a3a3", shelves: [{ org: "RefugeeR.", side: "-", pos: 1, aliases: ["Refugee Resettlement"] },{ org: "Binti", side: "-", pos: 2 },{ org: "Akasa", side: "-", pos: 3 },{ org: "Benifex", side: "-", pos: 4, aliases: ["Benefex"] },{ org: "Docebo", side: "-", pos: 5 }] },
  { id: "Z13", name: "Aisle 13", section: "Column 13", order: 13, color: "#78716c", shelves: [{ org: "Fortis Games", side: "-", pos: 1 },{ org: "Bitscale", side: "-", pos: 2 },{ org: "BallotReady", side: "-", pos: 3, aliases: ["Ballot Ready"] },{ org: "Ashby", side: "-", pos: 4 },{ org: "Beamery", side: "-", pos: 5 },{ org: "One", side: "-", pos: 6, aliases: ["One Corp Finance", "Corp Finance"] },{ org: "Lastpass", side: "-", pos: 7, aliases: ["LastPass"] }] },
  { id: "Z14", name: "Aisle 14", section: "Column 14", order: 14, color: "#b45309", shelves: [{ org: "Sprout", side: "-", pos: 1 },{ org: "Corp Finance", side: "-", pos: 2, aliases: ["One Corp Finance"] },{ org: "Smile/Venly", side: "-", pos: 3, aliases: ["Smile", "Venly"] },{ org: "Apollo Graph", side: "-", pos: 4, aliases: ["Apollo GraphQL"] },{ org: "Replicant", side: "-", pos: 5 },{ org: "Kinsta", side: "-", pos: 6 },{ org: "Abnormal", side: "-", pos: 7 }] },
  { id: "Z15", name: "Row 15", section: "Lower Row 15", order: 15, color: "#dc2626", shelves: [{ org: "Prenuvo", side: "-", pos: 1 },{ org: "Harmonic", side: "-", pos: 2 },{ org: "Discord", side: "-", pos: 3 },{ org: "Med Trainer", side: "-", pos: 4 },{ org: "Concert Ai", side: "-", pos: 5, aliases: ["ConcertAI", "Concert AI"] }] },
  { id: "Z16", name: "Row 16", section: "Lower Row 16", order: 16, color: "#ea580c", shelves: [{ org: "Sovos", side: "-", pos: 1 },{ org: "Cybercoders", side: "-", pos: 2, aliases: ["CyberCoders"] },{ org: "Momentus", side: "-", pos: 3 }] },
  { id: "Z17", name: "Row 17", section: "Lower Row 17", order: 17, color: "#ca8a04", shelves: [{ org: "Matillion", side: "-", pos: 1 },{ org: "Brightwheel", side: "-", pos: 2, aliases: ["BrightW"] },{ org: "UiPath", side: "-", pos: 3, aliases: ["Ui Path", "Uipath"] },{ org: "Typeform", side: "-", pos: 4 },{ org: "Life360", side: "-", pos: 5 }] },
  { id: "Z18", name: "Row 18", section: "Lower Row 18", order: 18, color: "#16a34a", shelves: [{ org: "Mercury", side: "-", pos: 1 },{ org: "Assent", side: "-", pos: 2 },{ org: "GAN Integrity", side: "-", pos: 3 },{ org: "Prison Fellow.", side: "-", pos: 4, aliases: ["Prison Fellowship"] },{ org: "SUI Foundat.", side: "-", pos: 5, aliases: ["SUI Foundation"] },{ org: "Veramed", side: "-", pos: 6 },{ org: "Fluidstack", side: "-", pos: 7, aliases: ["FluidStack"] },{ org: "Mews", side: "-", pos: 8 },{ org: "Motion", side: "-", pos: 9 },{ org: "Digital Ai", side: "-", pos: 10, aliases: ["Digital AI"] }] },
  { id: "Z19", name: "Row 19", section: "Lower Row 19", order: 19, color: "#0891b2", shelves: [{ org: "Cresta", side: "-", pos: 1 },{ org: "Atrium", side: "-", pos: 2 },{ org: "ECI", side: "-", pos: 3 },{ org: "Postman", side: "-", pos: 4 },{ org: "Verint", side: "-", pos: 5, aliases: ["Verint Used", "Verint New"] },{ org: "Cover Genius", side: "-", pos: 6 },{ org: "Branching Mind", side: "-", pos: 7 },{ org: "Exports", side: "-", pos: 8 }] },
  { id: "Z20", name: "Row 20", section: "Lower Row 20", order: 20, color: "#7c3aed", shelves: [{ org: "Ramp", side: "-", pos: 1 },{ org: "Braze", side: "-", pos: 2 },{ org: "Logically Ai", side: "-", pos: 3, aliases: ["Logically AI"] },{ org: "Wisp", side: "-", pos: 4 },{ org: "Permutive", side: "-", pos: 5 },{ org: "ECI", side: "-", pos: 6 },{ org: "Seat Geek", side: "-", pos: 7, aliases: ["SeatGeek"] },{ org: "Sentinel 1", side: "-", pos: 8, aliases: ["Sentinel One", "SentinelOne"] }] },
  { id: "Z21", name: "Row 21", section: "Lower Row 21", order: 21, color: "#be185d", shelves: [{ org: "YouGov", side: "-", pos: 1 },{ org: "Wrapbook", side: "-", pos: 2 },{ org: "Cloudflare", side: "-", pos: 3 },{ org: "Prepared", side: "-", pos: 4 },{ org: "Kraken", side: "-", pos: 5 },{ org: "Coastal Bank", side: "-", pos: 6, aliases: ["CoastalBank"] },{ org: "Macabacus", side: "-", pos: 7 },{ org: "Ramp", side: "-", pos: 8 }] },
  { id: "Z22", name: "Row 22", section: "Walkway", order: 22, color: "#525252", shelves: [] },
  { id: "Z23", name: "Row 23 (Bottom Floor)", section: "Bottom Row", order: 23, color: "#78716c", shelves: [{ org: "Carta", side: "-", pos: 1 },{ org: "Strava", side: "-", pos: 2 },{ org: "Horizon3.ai", side: "-", pos: 3, aliases: ["Horizon3"] },{ org: "Sophos", side: "-", pos: 4 },{ org: "CoreLight", side: "-", pos: 5, aliases: ["Corelight"] },{ org: "Wiz", side: "-", pos: 6 },{ org: "Care Lumen", side: "-", pos: 7 },{ org: "evermore", side: "-", pos: 8, aliases: ["Evermore"] },{ org: "Mindoula", side: "-", pos: 9 },{ org: "Anyscale", side: "-", pos: 10 },{ org: "Dutchie", side: "-", pos: 11 }] },
];

const PICK_RUN_ORDER: Record<string, string[]> = {
  Z1: ["OneTrust","BDS","Anyscale","Staffbase","Velocity","Phaidra","Sysdig"],
  Z2: ["MathCo","QbDVision","TrueAnom","JumpCloud","Crisis24","Stack Overflow","SandboxAQ"],
  Z3: ["Fabulous","Int. Growth","Movable Ink","Kleiner Perk","ShopMonkey","StackAdapt","NewRelic","Verve","Torchlight","TaxJar","Energy Found"],
  Z4: ["Single Grain","SnapCare","Sidecar Heath","Sift","SoRare","Synthesia"],
  Z5: ["OpenSesame","Astronomer","Primer","Productboard","Wise","Railbookers"],
  Z6: ["Neo4j","SOCI","Lokalise","Earnest Ana.","Moonpay","Nylas","Pacvue","Tailscale","Archer Faris","Mysten","Nanoramic"],
  Z7: ["Pax8","HackerOne","Varo Bank"],
  Z8: ["Varo Bank","Houzz","FirstBase","Dotdigital","Finfare","AppDirect"],
  Z9: ["Mercari","8th Light","Kallidus","3Cloud"],
  Z10: ["Pantheon","Anaplan","Crosby Legal","Papa"],
  Z11: ["HackerRank","BGB","Paxos","SpotOn","Rithum","ZenBusiness","A16Z"],
  Z12: ["RefugeeR.","Binti","Akasa","Benifex","Docebo"],
  Z13: ["Fortis Games","Bitscale","BallotReady","Ashby","Beamery","One","Lastpass"],
  Z14: ["Sprout","Corp Finance","Smile/Venly","Apollo Graph","Replicant","Kinsta","Abnormal"],
  Z15: ["Prenuvo","Harmonic","Discord","Med Trainer","Concert Ai"],
  Z16: ["Sovos","Cybercoders","Momentus"],
  Z17: ["Matillion","Brightwheel","UiPath","Typeform","Life360"],
  Z18: ["Mercury","Assent","GAN Integrity","Prison Fellow.","SUI Foundat.","Veramed","Fluidstack","Mews","Motion","Digital Ai"],
  Z19: ["Cresta","Atrium","ECI","Postman","Verint","Cover Genius","Branching Mind","Exports"],
  Z20: ["Ramp","Braze","Logically Ai","Wisp","Permutive","ECI","Seat Geek","Sentinel 1"],
  Z21: ["YouGov","Wrapbook","Cloudflare","Prepared","Kraken","Coastal Bank","Macabacus","Ramp"],
  Z23: ["Carta","Strava","Horizon3.ai","Sophos","CoreLight","Wiz","Care Lumen","evermore","Mindoula","Anyscale","Dutchie"],
};

// ============================================================
// Utility functions
// ============================================================
const normalizeOrg = (org: unknown): string => (org as string)?.toString().trim().toLowerCase() || "";
const buildOrderIndex = (list: string[]): Map<string, number> => { const map = new Map<string, number>(); list.forEach((name, idx) => map.set(normalizeOrg(name), idx)); return map; };
const ORG_ALIASES: Record<string, string> = { "sprout social": "sprout" };

const getOrderIndexForOrg = (orgName: unknown, orderIndex: Map<string, number>, orderList: string[]): number | undefined => {
  const nOrg = normalizeOrg(orgName);
  if (!nOrg) return undefined;
  const alias = ORG_ALIASES[nOrg];
  if (alias) { const aliasIndex = orderIndex.get(normalizeOrg(alias)); if (aliasIndex !== undefined) return aliasIndex; }
  const direct = orderIndex.get(nOrg);
  if (direct !== undefined) return direct;
  for (let i = 0; i < orderList.length; i++) { const normalized = normalizeOrg(orderList[i]); if (!normalized) continue; if (nOrg.includes(normalized) || normalized.includes(nOrg)) return i; }
  return undefined;
};

void PICK_RUN_ORDER;
void buildOrderIndex;
void getOrderIndexForOrg;

const ORG_TO_ZONES_MAP: Record<string, ZoneEntry[]> = {};
WAREHOUSE_ZONES.forEach((zone) => {
  zone.shelves.forEach((shelf) => {
    const entry: ZoneEntry = { zone, shelfPos: shelf.pos, side: shelf.side };
    const key = shelf.org.toLowerCase().trim();
    if (!ORG_TO_ZONES_MAP[key]) ORG_TO_ZONES_MAP[key] = [];
    ORG_TO_ZONES_MAP[key].push(entry);
    if (shelf.aliases) { shelf.aliases.forEach((alias) => { const aliasKey = alias.toLowerCase().trim(); if (!ORG_TO_ZONES_MAP[aliasKey]) ORG_TO_ZONES_MAP[aliasKey] = []; ORG_TO_ZONES_MAP[aliasKey].push(entry); }); }
  });
});

const getZonesForOrg = (orgName: unknown): ZoneEntry[] => {
  if (!orgName) return [];
  const key = (orgName as string).toString().toLowerCase().trim();
  if (ORG_TO_ZONES_MAP[key]) return ORG_TO_ZONES_MAP[key];
  for (const [mapKey, entries] of Object.entries(ORG_TO_ZONES_MAP)) { if (key.includes(mapKey) || mapKey.includes(key)) return entries; }
  return [];
};

const COLUMN_MAPPINGS: Record<string, string[]> = {
  inventoryId: ["Inventory ID","inventory_id","inventoryId","InventoryID","inventory-id","Asset ID","Asset Tag","asset_id","asset_tag","ID","Inventory id","inventory id","Asset Id"],
  serialNumber: ["Serial Number","serial_number","serialNumber","SerialNumber","serial-number","SN","sn","Serial number","Serial","serial","Serial No","Serial no","serial_no"],
  productTitle: ["Product Title","product_title","productTitle","ProductTitle","product-title","Title","title","Description","description","Product title","product_description","Product","Product Name","product_name","Name","name","Item","item","Device","device","Model","model"],
  organization: ["Organization","organization","ORGANIZATION","Org","org","Company","company","Department","department","Division","division","Team","team","Group","group","Unit","unit","Location","location","Site","site","Branch","branch","organisation_name","organization_name","Organization name","Organisation","organisation","Client","client","Customer","customer"],
  deployReason: ["deploy_reason","Deploy Reason","deployReason","DeployReason","deploy-reason","Reason","reason","Deployment Reason","deployment_reason","deploymentReason","Deploy reason"],
  deployStatus: ["deploy_status","Deploy Status","deployStatus","DeployStatus","deploy-status","Status","status","Deploy status"],
  category: ["Category","category","Item Category","item_category","Product Category","product_category","Type","type","Device Type","device_type"],
  found: ["Found","found","FOUND","scanned","Scanned","SCANNED","Checked","checked"],
};

const getColumnValue = (item: Record<string, unknown>, columnType: string): string | null => {
  if (!item || !columnType) return null;
  const possibleNames = COLUMN_MAPPINGS[columnType] || [];
  for (const name of possibleNames) { if (item[name] !== undefined && item[name] !== null) return item[name] as string; }
  const itemKeys = Object.keys(item);
  for (const name of possibleNames) { const lowerName = name.toLowerCase(); for (const key of itemKeys) { if (key.toLowerCase() === lowerName && item[key] !== undefined && item[key] !== null) return item[key] as string; } }
  return null;
};

const setColumnValue = (item: Record<string, unknown>, columnType: string, value: unknown): Record<string, unknown> => {
  if (!item || !columnType) return item;
  const possibleNames = COLUMN_MAPPINGS[columnType] || [];
  for (const name of possibleNames) { if (name in item) return { ...item, [name]: value }; }
  const itemKeys = Object.keys(item);
  for (const name of possibleNames) { const lowerName = name.toLowerCase(); for (const key of itemKeys) { if (key.toLowerCase() === lowerName) return { ...item, [key]: value }; } }
  if (possibleNames.length > 0) return { ...item, [possibleNames[0]]: value };
  return item;
};

const saveToStorage = (data: SavedState): void => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ } };
const loadFromStorage = (): SavedState | null => { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return JSON.parse(raw) as SavedState; } catch { return null; } };
const clearStorage = (): void => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } };

const normalize = (str: unknown): string => (str as string)?.toString().trim().toLowerCase() || "";
const safeValue = (item: Record<string, unknown>, columnType: string): string => getColumnValue(item, columnType) || "N/A";

const formatDeployReason = (value: unknown): string => {
  if (!value) return "N/A";
  return (value as string).toString().trim();
};
const formatDeployStatus = (value: unknown): string => {
  if (!value) return "N/A";
  return (value as string).toString().trim();
};
const formatCategory = (value: unknown): string => {
  if (!value) return "N/A";
  return (value as string).toString().trim();
};

const generateExportFilename = (csvFileName: string): string => {
  const baseName = csvFileName ? csvFileName.replace(/\.[^/.]+$/, "") : "inventory";
  return `put_away_${baseName}_${new Date().toISOString().slice(0, 10)}.csv`;
};
const triggerHapticFeedback = (): void => { if ("vibrate" in navigator) navigator.vibrate(VIBRATE_DURATION); };
const parseBoolean = (value: unknown): boolean => { if (typeof value === "boolean") return value; if (typeof value === "string") { const n = value.toLowerCase().trim(); return n === "true" || n === "1" || n === "yes"; } return false; };
const normalizeDeployReason = (value: unknown): string => (value as string)?.toString().trim().toUpperCase().replace(/\s+/g, "_") || "";
const matchesDeployReasonFilter = (item: Record<string, unknown>, filter: string): boolean => {
  if (!filter || filter === "ALL") return true;
  const dr = normalizeDeployReason(getColumnValue(item, "deployReason"));
  if (filter === "NONE") return !dr;
  return dr === normalizeDeployReason(filter);
};

const useInventorySearch = (inventoryList: InventoryItem[]) => {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredList = useMemo(() => {
    if (!searchQuery) return [] as InventoryItem[];
    const query = searchQuery.toLowerCase();
    return inventoryList.filter((item) => {
      const inv = getColumnValue(item, "inventoryId")?.toLowerCase() || "";
      const sn = getColumnValue(item, "serialNumber")?.toLowerCase() || "";
      const pt = getColumnValue(item, "productTitle")?.toLowerCase() || "";
      const org = getColumnValue(item, "organization")?.toLowerCase() || "";
      const dr = getColumnValue(item, "deployReason")?.toLowerCase() || "";
      return inv.includes(query) || sn.includes(query) || pt.includes(query) || org.includes(query) || dr.includes(query);
    });
  }, [searchQuery, inventoryList]);
  return { searchQuery, setSearchQuery, filteredList };
};

// ============================================================
// Sub-Components
// ============================================================

const ScanResult: React.FC<{ scannedCode: string; found: boolean; scannedItem?: InventoryItem | null; queued?: boolean }> = ({ scannedCode, found, scannedItem, queued = false }) => {
  void queued;
  if (!scannedCode) return null;
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const deployReason = scannedItem ? getColumnValue(scannedItem, "deployReason") : null;
  const deployStatus = scannedItem ? getColumnValue(scannedItem, "deployStatus") : null;
  const productTitle = scannedItem ? getColumnValue(scannedItem, "productTitle") : null;
  const organization = scannedItem ? getColumnValue(scannedItem, "organization") : null;
  const drNorm = deployReason?.toString().trim().toUpperCase() || "";
  const isRecycle = drNorm === "RECYCLING_REQUESTED";
  const bg = found
    ? (isDark ? "rgba(22,163,74,0.18)" : "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)")
    : (isDark ? "rgba(220,38,38,0.18)" : "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)");
  const textColor = found ? (isDark ? "#4ade80" : "#15803d") : (isDark ? "#f87171" : "#b91c1c");
  const subColor = found ? (isDark ? "#86efac" : "#166534") : (isDark ? "#fca5a5" : "#991b1b");
  return (
    <Paper
      radius="xl"
      p="lg"
      mb="sm"
      className="scan-result-enter"
      style={{
        background: bg,
        border: `2px solid ${found ? (isDark ? "#16a34a" : "#16a34a") : (isDark ? "#dc2626" : "#dc2626")}`,
      }}
    >
      <Group gap="md" align="center">
        <ThemeIcon
          radius="xl"
          size={48}
          color={found ? "green" : "red"}
          variant={isDark ? "light" : "filled"}
          style={{ flexShrink: 0, boxShadow: found ? "0 4px 14px rgba(22,163,74,0.35)" : "0 4px 14px rgba(220,38,38,0.35)" }}
        >
          {found ? <IconCheck size={24} /> : <IconX size={24} />}
        </ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" align="center" mb={2}>
            <Text fw={800} ff="monospace" size="lg" style={{ color: textColor }}>{scannedCode}</Text>
            <Badge color={found ? "green" : "red"} variant="filled" size="sm" radius="xl">{found ? "✓ Put Away" : "✗ Not on Cart"}</Badge>
          </Group>
          {productTitle && productTitle !== "N/A" && (
            <Text size="sm" fw={500} style={{ color: subColor }} truncate>{productTitle}</Text>
          )}
          {(organization && organization !== "N/A") && (
            <Text size="xs" style={{ color: textColor, opacity: 0.75 }}>{organization}</Text>
          )}
          {(deployReason && deployReason !== "N/A") || (deployStatus && deployStatus !== "N/A") ? (
            <Group gap={4} mt={4}>
              {deployReason && deployReason !== "N/A" && (
                <Badge size="xs" color={isRecycle ? "yellow" : "red"} variant="light" radius="xl">
                  {formatDeployReason(deployReason)}
                </Badge>
              )}
              {deployStatus && deployStatus !== "N/A" && (
                <Badge size="xs" color={deployStatus.toString().toUpperCase() === "AVAILABLE" ? "teal" : "violet"} variant="light" radius="xl">
                  {formatDeployStatus(deployStatus)}
                </Badge>
              )}
            </Group>
          ) : null}
        </div>
      </Group>
    </Paper>
  );
};

const GoogleSheetsConnector: React.FC<{
  googleState: GoogleSheetsState;
  onSignIn: () => Promise<void>;
  onSignOut: () => void;
  onSelectSpreadsheet: (id: string) => Promise<void>;
  onSelectTab: (tab: string) => void;
  onLoadSheet: () => Promise<void>;
  onToggleSync: (enabled: boolean) => void;
  onExportToSheet: () => Promise<void>;
  onDisconnect: () => void;
  hasInventory: boolean;
  foundCount: number;
  totalCount: number;
}> = ({ googleState, onSignIn, onSignOut, onSelectSpreadsheet, onSelectTab, onLoadSheet, onToggleSync, onExportToSheet, onDisconnect, hasInventory, foundCount, totalCount }) => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [selectLoading, setSelectLoading] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  const handleSignIn = async () => { setSignInLoading(true); try { await onSignIn(); } finally { setSignInLoading(false); } };
  const handleSelectSpreadsheet = async (id: string) => { setSelectLoading(id); try { await onSelectSpreadsheet(id); } finally { setSelectLoading(null); } };
  const handleManualConnect = async () => { const id = GSheets.extractSpreadsheetId(manualUrl); if (!id) return; await handleSelectSpreadsheet(id); };
  const handleExport = async () => { setExportLoading(true); try { await onExportToSheet(); } finally { setExportLoading(false); } };

  if (!googleState.isSignedIn) {
    return (
      <Paper radius="xl" p="lg" withBorder style={{ backgroundColor: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.25)", boxShadow: "var(--card-shadow)" }}>
        <Group gap="md" mb="md">
          <ThemeIcon radius="xl" size={44} color="green" variant="light" style={{ flexShrink: 0 }}>
            <IconFileSpreadsheet size={22} />
          </ThemeIcon>
          <div>
            <Text fw={700} size="md" style={{ color: "var(--text-primary)" }}>Google Sheets</Text>
            <Text size="xs" style={{ color: "var(--text-secondary)" }}>Import, sync & export inventory</Text>
          </div>
        </Group>
        <Text size="sm" style={{ color: "var(--text-secondary)" }} mb="md" lh={1.6}>
          Connect your Google account to pull inventory from Sheets, sync scans live, and push results back.
        </Text>
        {googleState.error && <Alert color="red" mb="sm" radius="md">{googleState.error}</Alert>}
        <Button fullWidth leftSection={<IconFileSpreadsheet size={16} />} color="green" radius="xl" loading={signInLoading} onClick={handleSignIn} size="md">
          Sign in with Google
        </Button>
      </Paper>
    );
  }

  if (!googleState.isConnected) {
    return (
      <Paper radius="xl" p="lg" withBorder style={{ backgroundColor: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.25)", boxShadow: "var(--card-shadow)" }}>
        <Group justify="space-between" mb="md" align="center">
          <Group gap="xs">
            <Box style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.2)" }} />
            <Text fw={700} size="sm" style={{ color: "var(--text-primary)" }}>Choose a Spreadsheet</Text>
          </Group>
          <Button size="xs" variant="subtle" color="red" radius="xl" onClick={onSignOut}>Sign Out</Button>
        </Group>
        {googleState.error && <Alert color="red" mb="sm" radius="md">{googleState.error}</Alert>}
        {googleState.isLoading ? (
          <Group justify="center" p="lg" gap="sm">
            <Loader size="sm" color="green" />
            <Text c="dimmed" size="sm">Loading your spreadsheets…</Text>
          </Group>
        ) : googleState.recentSpreadsheets.length > 0 ? (
          <ScrollArea.Autosize mah={260} mb="sm">
            <Stack gap={4}>
              {googleState.recentSpreadsheets.map((sheet) => (
                <Paper
                  key={sheet.id} p="sm" radius="lg"
                  style={{ cursor: "pointer", opacity: selectLoading && selectLoading !== sheet.id ? 0.45 : 1, backgroundColor: "var(--item-bg)", border: "1px solid var(--section-border)", transition: "box-shadow 0.15s" }}
                  onClick={() => handleSelectSpreadsheet(sheet.id)}
                >
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon radius="md" size="md" color="green" variant="light" style={{ flexShrink: 0 }}>
                      <IconFileSpreadsheet size={14} />
                    </ThemeIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate style={{ color: "var(--text-primary)" }}>{sheet.name}</Text>
                      <Text size="xs" c="dimmed">Modified {new Date(sheet.modifiedTime).toLocaleDateString()}</Text>
                    </div>
                    {selectLoading === sheet.id ? <Loader size="xs" color="green" /> : <IconChevronDown size={14} style={{ transform: "rotate(-90deg)", color: "var(--text-muted)" }} />}
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        ) : (
          <Text ta="center" c="dimmed" size="sm" mb="sm" p="md">No spreadsheets found. Try pasting a URL below.</Text>
        )}
        <Divider my="sm" color="var(--divider-color)" />
        {showUrlInput ? (
          <Group gap="sm">
            <TextInput flex={1} placeholder="Paste Google Sheet URL…" value={manualUrl} radius="xl"
              onChange={(e) => setManualUrl(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && manualUrl.trim()) handleManualConnect(); }} />
            <Button onClick={handleManualConnect} disabled={!manualUrl.trim() || selectLoading !== null} color="green" radius="xl">Open</Button>
          </Group>
        ) : (
          <Button variant="subtle" color="green" fullWidth size="xs" radius="xl" onClick={() => setShowUrlInput(true)}>
            Paste a Google Sheet URL instead
          </Button>
        )}
      </Paper>
    );
  }

  return (
    <Paper radius="xl" p="md" withBorder style={{ backgroundColor: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.25)", boxShadow: "var(--card-shadow)" }}>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Box style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.2)", flexShrink: 0 }} />
          <Text fw={700} size="sm" truncate style={{ color: "var(--text-primary)" }}>{googleState.spreadsheetTitle}</Text>
        </Group>
        <Button size="xs" variant="subtle" color="red" radius="xl" onClick={onDisconnect}>Disconnect</Button>
      </Group>
      {googleState.error && <Alert color="red" mb="sm" radius="md">{googleState.error}</Alert>}
      <Select
        label="Sheet Tab"
        placeholder="Select a tab…"
        value={googleState.sheetTab}
        onChange={(val) => val && onSelectTab(val)}
        data={googleState.sheetTabs.map((t) => ({ value: t.title, label: `${t.title} (${t.rowCount} rows)` }))}
        radius="lg"
        mb="sm"
      />
      <SimpleGrid cols={2} spacing="xs" mb="sm">
        <Button leftSection={<IconDownload size={15} />} onClick={onLoadSheet} disabled={!googleState.sheetTab || googleState.isLoading} loading={googleState.isLoading} color="blue" radius="xl" size="sm">Import</Button>
        <Button leftSection={<IconCloudUpload size={15} />} onClick={handleExport} disabled={!hasInventory || exportLoading || !googleState.sheetTab} loading={exportLoading} color="green" radius="xl" size="sm">Export</Button>
      </SimpleGrid>
      {hasInventory && googleState.sheetTab && (
        <Paper p="sm" radius="lg" style={{ backgroundColor: "rgba(255,255,255,0.6)", border: "1px solid #d1fae5" }}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon radius="md" size="sm" color={googleState.realtimeSync ? "green" : "gray"} variant="light">
                <IconCloudUpload size={12} />
              </ThemeIcon>
              <div>
                <Text size="xs" fw={700} style={{ color: "#166534" }}>Live Sync {googleState.realtimeSync ? "● On" : "○ Off"}</Text>
                <Text size="xs" c="dimmed">{googleState.realtimeSync ? `${foundCount}/${totalCount} synced` : "Updates sheet on scan"}</Text>
              </div>
            </Group>
            <Switch checked={googleState.realtimeSync} onChange={(e) => onToggleSync(e.currentTarget.checked)} color="green" size="sm" />
          </Group>
        </Paper>
      )}
    </Paper>
  );
};

// ============================================================
// PICK RUN ZONE VIRTUALIZED LIST
// ============================================================
const PICK_ZONE_ROW_HEIGHT = 108;
const PICK_ZONE_OVERSCAN = 6;

const VirtualizedPickItems = memo<{
  items: PickItem[];
  isFoundItem: (item: Record<string, unknown>) => boolean;
  onNotHere: (key: string, isNotHere: boolean, itemId: string) => void;
  activeOrganization?: string;
  showOnlyActiveOrganization?: boolean;
}>(({ items, isFoundItem, onNotHere, activeOrganization, showOnlyActiveOrganization = false }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateHeight = () => setViewportHeight(el.clientHeight || 420);
    updateHeight();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const filteredItems = useMemo(() => {
    const baseItems = (!activeOrganization || !showOnlyActiveOrganization)
      ? items
      : items.filter((item) => normalize(getColumnValue(item, "organization")) === normalize(activeOrganization));

    // Keep active (unscanned) items at the top of the current aisle/company,
    // and sink completed items (Found or Not Found) to the bottom.
    return baseItems
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const aDone = isFoundItem(a.item) || !!a.item._notHere;
        const bDone = isFoundItem(b.item) || !!b.item._notHere;
        if (aDone !== bDone) return aDone ? 1 : -1;
        return a.idx - b.idx; // stable route order within each bucket
      })
      .map((entry) => entry.item);
  }, [items, activeOrganization, showOnlyActiveOrganization, isFoundItem]);

  const totalHeight = filteredItems.length * PICK_ZONE_ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / PICK_ZONE_ROW_HEIGHT) - PICK_ZONE_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / PICK_ZONE_ROW_HEIGHT) + PICK_ZONE_OVERSCAN * 2;
  const endIndex = Math.min(filteredItems.length, startIndex + visibleCount);
  const topPad = startIndex * PICK_ZONE_ROW_HEIGHT;
  const bottomPad = Math.max(0, totalHeight - topPad - (endIndex - startIndex) * PICK_ZONE_ROW_HEIGHT);
  const visibleItems = useMemo(() => filteredItems.slice(startIndex, endIndex), [filteredItems, startIndex, endIndex]);

  return (
    <Box
      ref={viewportRef}
      style={{ maxHeight: 420, overflowY: "auto" }}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
    >
      <Stack gap={4} p="sm" pt="xs">
        {topPad > 0 && <Box style={{ height: topPad }} />}

        {visibleItems.map((item) => {
          const isFound = isFoundItem(item);
          const isNotHere = item._notHere;
          const deployReason = getColumnValue(item, "deployReason");
          const deployStatus = getColumnValue(item, "deployStatus");
          const organization = getColumnValue(item, "organization");
          const category = getColumnValue(item, "category");
          const drNorm = deployReason?.toString().trim().toUpperCase() || "";
          const isRecycle = drNorm === "RECYCLING_REQUESTED";
          const serial = safeValue(item, "serialNumber");
          const inventoryId = safeValue(item, "inventoryId");
          const bgColor = isFound ? "var(--item-found-bg)" : isNotHere ? "var(--item-notfound-bg)" : "var(--item-bg)";
          const accentColor = isFound ? "#16a34a" : isNotHere ? "#dc2626" : "#64748b";
          const boxShadow = isFound
            ? "0 4px 12px rgba(22,163,74,0.18), 0 1px 3px rgba(0,0,0,0.08)"
            : isNotHere
            ? "0 4px 12px rgba(220,38,38,0.18), 0 1px 3px rgba(0,0,0,0.08)"
            : "var(--item-neutral-shadow)";

          return (
            <Paper
              key={item._pickItemKey || item._id}
              p="md"
              radius="lg"
              withBorder
              style={{
                position: "relative",
                overflow: "hidden",
                backgroundColor: bgColor,
                opacity: isFound || isNotHere ? 0.75 : 1,
                minHeight: PICK_ZONE_ROW_HEIGHT - 6,
                boxShadow,
                transition: "opacity 0.2s",
                borderColor: "rgba(148,163,184,0.25)",
              }}
            >
              <Box
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  backgroundColor: accentColor,
                }}
              />

              <Group gap="sm" align="flex-start" wrap="nowrap" style={{ paddingLeft: 8 }}>
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={700} style={{ color: "var(--text-primary)", wordBreak: "break-word", textDecoration: isFound || isNotHere ? "line-through" : "none" }}>
                    {safeValue(item, "productTitle")}
                  </Text>

                  <Group gap={6} style={{ flexWrap: "wrap" }}>
                    <Badge size="sm" variant="light" color="indigo" radius="xl" ff="monospace">
                      SN: {serial}
                    </Badge>
                    <Badge size="sm" variant="light" color="lime" radius="xl" ff="monospace">
                      ID: {inventoryId}
                    </Badge>
                    {organization && organization !== "N/A" && (
                      <Badge size="sm" variant="light" color="orange" radius="xl">
                        {organization}
                      </Badge>
                    )}
                    {category && category !== "N/A" && (
                      <Badge size="sm" variant="light" color="pink" radius="xl">
                        {formatCategory(category)}
                      </Badge>
                    )}
                    {deployReason && deployReason !== "N/A" && (
                      <Badge size="sm" variant="light" color={isRecycle ? "yellow" : "red"} radius="xl">{formatDeployReason(deployReason)}</Badge>
                    )}
                    {deployStatus && deployStatus !== "N/A" && (
                      <Badge size="sm" variant="light" color={deployStatus.toString().toUpperCase() === "AVAILABLE" ? "teal" : "violet"} radius="xl">{formatDeployStatus(deployStatus)}</Badge>
                    )}
                  </Group>
                </Stack>

                <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                  <Badge
                    size="sm"
                    radius="xl"
                    variant={isFound || isNotHere ? "filled" : "light"}
                    color={isFound ? "green" : isNotHere ? "red" : "gray"}
                    leftSection={isFound ? <IconCheck size={12} /> : isNotHere ? <IconX size={12} /> : <IconPackage size={12} />}
                  >
                    {isFound ? "Put Away" : isNotHere ? "Not Here" : "To Put Away"}
                  </Badge>

                  {!isFound && (
                    <Button
                      size="compact-xs"
                      variant={isNotHere ? "light" : "filled"}
                      color={isNotHere ? "gray" : "red"}
                      radius="xl"
                      onClick={(e) => { e.stopPropagation(); onNotHere(item._pickItemKey, !isNotHere, item._id); }}
                      style={{ flexShrink: 0 }}
                    >
                      {isNotHere ? "Undo" : "Not Here"}
                    </Button>
                  )}
                </Stack>
              </Group>
            </Paper>
          );
        })}

        {bottomPad > 0 && <Box style={{ height: bottomPad }} />}
      </Stack>
    </Box>
  );
});

// ============================================================
// PICK RUN VIEW
// ============================================================
const PickRunView: React.FC<{
  pickRunData: PickRunDataType;
  inventoryList: InventoryItem[];
  detectedColumns: Record<string, string>;
  foundIdSet: Set<string>;
  onClose: () => void;
  lastScannedCode: string;
  lastScanFound: boolean;
  notHereItems: Record<string, boolean>;
  onNotHere: (key: string, isNotHere: boolean, itemId: string) => void;
  onScan: (code: string) => void;
}> = ({ pickRunData, inventoryList, detectedColumns, foundIdSet, onClose, lastScannedCode, lastScanFound, notHereItems, onNotHere, onScan }) => {
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({}); // collapsed by default for performance
  const inventoryById = useMemo(() => { const map = new Map<string, InventoryItem>(); inventoryList.forEach((item) => map.set(item._id, item)); return map; }, [inventoryList]);
  const foundColumnName = detectedColumns.found || "Found";
  const isFoundItem = useCallback((item: Record<string, unknown>) => foundIdSet.has(item._id as string) || !!item[foundColumnName], [foundIdSet, foundColumnName]);

  const liveZones = useMemo(() => {
    const zones = pickRunData.zones.map((zone) => {
      const liveItems: PickItem[] = zone.items.map((pickItem) => {
        const liveItem = inventoryById.get(pickItem._id);
        return {
          ...(liveItem || pickItem),
          _shelfPos: pickItem._shelfPos,
          _shelfSide: pickItem._shelfSide,
          _pickItemKey: pickItem._pickItemKey,
          _notHere: !!notHereItems[pickItem._pickItemKey],
        } as PickItem;
      });

      let unfoundCount = 0;
      for (let i = 0; i < liveItems.length; i++) {
        const item = liveItems[i];
        if (!isFoundItem(item) && !item._notHere) unfoundCount++;
      }
      const allDone = unfoundCount === 0;
      return { ...zone, items: liveItems, unfoundCount, _autoCompleted: allDone, _sinkToBottom: allDone };
    });

    // Keep completed zones at the bottom, otherwise keep stable route order.
    return zones.sort((a, b) => {
      if (a._sinkToBottom !== b._sinkToBottom) return a._sinkToBottom ? 1 : -1;
      return a.order - b.order;
    });
  }, [pickRunData.zones, inventoryById, notHereItems, isFoundItem]);

  const uniqueTotals = useMemo(() => {
    const seenIds = new Set<string>(); const seenUnfoundIds = new Set<string>(); const seenNotHereIds = new Set<string>(); const seenFoundIds = new Set<string>();
    liveZones.forEach((zone) => { zone.items.forEach((item) => { seenIds.add(item._id); if (item._notHere) seenNotHereIds.add(item._id); else if (!isFoundItem(item)) seenUnfoundIds.add(item._id); else seenFoundIds.add(item._id); }); });
    return { totalItems: seenIds.size, totalRemaining: seenUnfoundIds.size, totalFound: seenFoundIds.size, totalNotHere: seenNotHereIds.size };
  }, [liveZones, isFoundItem]);

  const { totalItems, totalRemaining, totalFound, totalNotHere } = uniqueTotals;

  const activeZone = useMemo(
    () => liveZones.find((zone) => (zone.unfoundCount ?? 0) > 0),
    [liveZones],
  );

  const activeOrganization = useMemo(() => {
    if (!activeZone) return "";
    const nextItem = activeZone.items.find((item) => !isFoundItem(item) && !item._notHere);
    return (getColumnValue(nextItem || {}, "organization") || "").toString();
  }, [activeZone, isFoundItem]);

  useEffect(() => {
    if (!activeZone) return;
    setExpandedZones((prev) => {
      if (prev[activeZone.zoneId]) return prev;
      return { ...prev, [activeZone.zoneId]: true };
    });
  }, [activeZone]);

  const toggleZone = useCallback((zoneId: string) => {
    setExpandedZones((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  }, []);

  const unmappedItems = useMemo(
    () => pickRunData.unmapped.map((pi) => inventoryById.get(pi._id) || pi),
    [pickRunData.unmapped, inventoryById],
  );
  const unmappedUnfound = unmappedItems.filter((item) => !isFoundItem(item));
  const isPickRunComplete = totalRemaining === 0 && unmappedUnfound.length === 0;

  const pct = totalItems > 0 ? Math.round((totalFound / totalItems) * 100) : 0;

  return (
    <Stack gap="md">

      {/* Header */}
      <Paper radius="xl" p="lg" withBorder style={{ backgroundColor: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.25)", boxShadow: "var(--card-shadow)" }}>
        <Group justify="space-between" mb="sm" align="center">
          <Group gap="sm">
            <ThemeIcon radius="xl" size={36} color="orange" variant="light">
              <IconWalk size={20} />
            </ThemeIcon>
            <div>
              <Group gap="xs" align="center">
                <Text size="lg" fw={800} style={{ color: "var(--text-primary)", lineHeight: 1.1 }}>Put Away Run</Text>
              </Group>
              <Text size="xs" style={{ color: "var(--text-muted)" }}>{pct}% complete</Text>
            </div>
          </Group>
          <Button variant="light" color="orange" size="xs" radius="xl" onClick={onClose} style={{ fontWeight: 700 }}>
            Exit
          </Button>
        </Group>
        <Progress value={pct} size={6} radius="xl" mb="md" color="orange" styles={{ root: { backgroundColor: "rgba(249,115,22,0.15)" } }} />
        <SimpleGrid cols={3} spacing="xs">
          {[
            { value: totalFound, label: "Put Away", color: "#16a34a" },
            { value: totalNotHere, label: "Not Here", color: "#dc2626" },
            { value: totalRemaining + unmappedUnfound.length, label: "Remaining", color: "var(--text-primary)" },
          ].map((s) => (
            <Paper key={s.label} p="xs" radius="lg" withBorder style={{ backgroundColor: "rgba(249,115,22,0.06)", borderColor: "rgba(249,115,22,0.15)", textAlign: "center" }}>
              <Text size="xl" fw={900} style={{ color: s.color, lineHeight: 1.1 }}>{s.value}</Text>
              <Text size="xs" fw={500} style={{ color: "var(--text-muted)", marginTop: 2 }}>{s.label}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Paper>

      <TextInput
        placeholder="Scan or type barcode here…"
        leftSection={<IconSearch size={16} />}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const val = e.currentTarget.value.trim();
            if (val) { onScan(val); e.currentTarget.value = ""; }
          }
        }}
        radius="xl"
        size="md"
        styles={{ input: { backgroundColor: "var(--card-bg)", border: "1.5px solid var(--item-border)" } }}
      />

      {lastScannedCode && <ScanResult scannedCode={lastScannedCode} found={lastScanFound} />}

      {isPickRunComplete && (
        <Paper radius="xl" p="lg" style={{ background: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)", border: "2px solid #16a34a", textAlign: "center" }}>
          <ThemeIcon radius="xl" size={56} color="green" variant="filled" mx="auto" mb="sm" style={{ boxShadow: "0 4px 20px rgba(22,163,74,0.35)" }}>
            <IconCheck size={28} />
          </ThemeIcon>
          <Text size="xl" fw={800} style={{ color: "#15803d" }}>Put Away Complete!</Text>
          <Text size="sm" style={{ color: "#166534" }} mt={4}>All {totalItems} devices put away.</Text>
        </Paper>
      )}



      {/* Zone cards */}
      {liveZones.map((zone) => {
        const isExpanded = !!expandedZones[zone.zoneId];
        const allDone = (zone.unfoundCount ?? 0) === 0;
        const canExpand = !allDone;
        const isActiveZone = !!activeZone && activeZone.zoneId === zone.zoneId;
        const notFoundCount = zone.items.reduce((acc, item) => acc + (item._notHere ? 1 : 0), 0);
        const scannedCount = zone.items.reduce((acc, item) => acc + (!item._notHere && isFoundItem(item) ? 1 : 0), 0);
        const remainingCount = Math.max(0, zone.items.length - scannedCount - notFoundCount);

        const borderColor = allDone
          ? "#16a34a"
          : "var(--section-border)";
        const bgColor = allDone
          ? "var(--zone-done-bg)"
          : "var(--item-bg)";

        return (
          <Paper key={zone.zoneId} radius="xl" style={{ border: `2px solid ${borderColor}`, backgroundColor: bgColor, opacity: allDone ? 0.6 : 1, overflow: "hidden", transition: "opacity 0.2s" }}>
            <Group
              p="sm"
              gap="sm"
              style={{ cursor: canExpand ? "pointer" : "default" }}
              onClick={() => { if (canExpand) toggleZone(zone.zoneId); }}
            >
              <ThemeIcon
                radius="xl"
                size={36}
                color={allDone ? "green" : "gray"}
                variant={allDone ? "light" : "filled"}
                style={{
                  backgroundColor: allDone ? undefined : "var(--section-bg)",
                  color: allDone ? undefined : "var(--text-secondary)",
                  flexShrink: 0,
                  boxShadow: "none",
                  border: allDone ? undefined : "1px solid var(--section-border)",
                }}
              >
                {allDone ? <IconCheck size={16} /> : <Text size="sm" fw={800} style={{ color: isActiveZone ? undefined : "var(--text-secondary)" }}>{zone.order}</Text>}
              </ThemeIcon>
              <div style={{ flex: 1 }}>
                <Group gap={6} align="center">
                  <Text size="sm" fw={700} c={allDone ? "green" : undefined} td={allDone ? "line-through" : undefined}>{zone.zoneName}</Text>
                  {isActiveZone && <Badge size="xs" color="gray" variant="light" radius="xl">Active</Badge>}
                  {isActiveZone && activeOrganization && <Text size="sm" fw={700} c={allDone ? "green" : undefined} td={allDone ? "line-through" : undefined}>→ {activeOrganization}</Text>}
                </Group>
                <Group gap={8} mt={2}>
                  {scannedCount > 0 && <Text size="xs" style={{ color: "#16a34a" }} fw={600}>{scannedCount} scanned</Text>}
                  {notFoundCount > 0 && <Text size="xs" style={{ color: "#dc2626" }} fw={600}>{notFoundCount} not here</Text>}
                  {remainingCount > 0 && <Text size="xs" c="dimmed">{remainingCount} left</Text>}
                  {allDone && <Text size="xs" style={{ color: "#16a34a" }} fw={600}>All done ✓</Text>}
                </Group>
              </div>
              {canExpand && (
                <IconChevronDown size={16} style={{ color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }} />
              )}
            </Group>
            <Collapse in={canExpand && isExpanded}>
              {canExpand && isExpanded && (
                <Box style={{ borderTop: `1px solid ${borderColor}` }}>
                  <VirtualizedPickItems
                    items={zone.items}
                    isFoundItem={isFoundItem}
                    onNotHere={onNotHere}
                    activeOrganization={isActiveZone ? activeOrganization : undefined}
                    showOnlyActiveOrganization={isActiveZone && !!activeOrganization}
                  />
                </Box>
              )}
            </Collapse>
          </Paper>
        );
      })}

      {/* Unmapped items */}
      {unmappedItems.length > 0 && (
        <Paper radius="xl" style={{ border: "2px solid #8b5cf640", backgroundColor: "var(--unmapped-bg)", overflow: "hidden" }}>
          <Group p="sm" gap="sm" style={{ cursor: "pointer" }} onClick={() => toggleZone("unmapped")}>
            <ThemeIcon radius="xl" size={36} color="violet" variant="light" style={{ flexShrink: 0 }}>
              <IconAlertTriangle size={16} />
            </ThemeIcon>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={700} c="violet">Unknown Location</Text>
              <Text size="xs" c="dimmed">{unmappedUnfound.length} of {unmappedItems.length} — org not on warehouse map</Text>
            </div>
            <IconChevronDown size={16} style={{ color: "var(--text-muted)", transform: expandedZones.unmapped ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
          </Group>
          <Collapse in={!!expandedZones.unmapped}>
            {!!expandedZones.unmapped && (
              <Stack gap={4} p="sm" pt={0}>
                {unmappedItems.map((item) => {
                  const isFound = isFoundItem(item);
                  return (
                    <Paper key={item._id} p="sm" radius="lg" style={{ borderLeft: `4px solid ${isFound ? "#16a34a" : "#8b5cf6"}`, backgroundColor: isFound ? "var(--item-found-bg)" : "var(--item-bg)", opacity: isFound ? 0.65 : 1 }}>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size="sm" radius="xl" color={isFound ? "green" : "violet"} variant="light">
                          {isFound ? <IconCheck size={10} /> : <IconPackage size={10} />}
                        </ThemeIcon>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={700} ff="monospace" style={{ color: "var(--text-secondary)" }}>{safeValue(item, "serialNumber")} / {safeValue(item, "inventoryId")}</Text>
                          <Text size="xs" c="dimmed" truncate>{safeValue(item, "productTitle")}</Text>
                        </div>
                        <Badge size="sm" variant="light" color="violet" radius="xl">{(getColumnValue(item, "organization") as string) || "No Org"}</Badge>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Collapse>
        </Paper>
      )}

      {!isPickRunComplete && totalFound > 0 && (
        <Paper radius="xl" p="md" style={{ backgroundColor: "var(--warning-item-bg)", border: "1.5px solid var(--warning-item-border)" }}>
          <Group gap="sm">
            <ThemeIcon radius="xl" size={32} color="red" variant="light" style={{ flexShrink: 0 }}>
              <IconAlertTriangle size={16} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={700} style={{ color: "#b91c1c" }}>
                {totalRemaining + unmappedUnfound.length} devices still to put away
              </Text>
              <Text size="xs" style={{ color: "#991b1b" }}>Check device locations or mark as not here.</Text>
            </div>
          </Group>
        </Paper>
      )}
    </Stack>
  );
};


// ============================================================
// MAIN COMPONENT
// ============================================================
export default function InventoryScanner() {
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');
  const isDark = computedColorScheme === 'dark';

  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [lastScannedCode, setLastScannedCode] = useState("");
  const [lastScanFound, setLastScanFound] = useState(false);
  const [foundCount, setFoundCount] = useState(0);
  const [foundIdSet, setFoundIdSet] = useState<Set<string>>(new Set());
  const [notFoundIdSet, setNotFoundIdSet] = useState<Set<string>>(new Set());
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({});
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const uploadStatusTimerRef = useRef<number | undefined>(undefined);
  const [pickRunMode, setPickRunMode] = useState(false);
  const [pickRunData, setPickRunData] = useState<PickRunDataType | null>(null);
  const [notHereItems, setNotHereItems] = useState<Record<string, boolean>>({});
  const [deployReasonFilter, setDeployReasonFilter] = useState("ALL");
  const [, setFoundMap] = useState<Map<string, boolean>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasRestoredRef = useRef(false);
  const lookupMapRef = useRef<Map<string, number>>(new Map());
  const pickItemKeysByItemIdRef = useRef<Map<string, string[]>>(new Map());
  const inventoryListRef = useRef<InventoryItem[]>([]);
  const foundIdSetRef = useRef<Set<string>>(new Set());
  const notFoundIdSetRef = useRef<Set<string>>(new Set());
  const detectedColumnsRef = useRef<Record<string, string>>({});
  const pickRunModeRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const autoStartRef = useRef(false);

  const initialClientId = GSheets.getSavedClientId();
  const [googleState, setGoogleState] = useState<GoogleSheetsState>({
    isConnected: false, isLoading: false, error: "", spreadsheetId: "", spreadsheetTitle: "", sheetTab: "", sheetTabs: [], realtimeSync: false, showSetup: !initialClientId, isSignedIn: false, recentSpreadsheets: [], clientId: initialClientId, sheetHeaders: [], foundColumnIndex: -1,
  });
  const pendingSyncQueue = useRef<Array<{ itemId: string; rowIndex: number }>>([]);
  const syncInProgress = useRef(false);
  const queueGoogleSyncRef = useRef<((item: InventoryItem) => void) | null>(null);
  const { setSearchQuery } = useInventorySearch(inventoryList);

  const deferredFoundIdSet = useDeferredValue(foundIdSet);
  const buildLookupMap = useCallback((dataList: InventoryItem[]) => {
    const map = new Map<string, number>();
    dataList.forEach((item, index) => { const inv = normalize(getColumnValue(item, "inventoryId")); const sn = normalize(getColumnValue(item, "serialNumber")); if (inv) map.set(inv, index); if (sn) map.set(sn, index); });
    lookupMapRef.current = map;
  }, []);

  // Save — debounced so rapid scans don't trigger JSON.stringify on every scan
  useEffect(() => {
    if (inventoryList.length === 0) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveToStorage({ inventoryList, csvFileName, foundCount: foundIdSet.size, foundIds: Array.from(foundIdSet), notFoundIds: Array.from(notFoundIdSet), detectedColumns, organizations, pickRunData, notHereItems, deployReasonFilter, googleSheetId: googleState.spreadsheetId || undefined, googleSheetTitle: googleState.spreadsheetTitle || undefined, googleSheetTab: googleState.sheetTab || undefined, googleSyncEnabled: googleState.realtimeSync || undefined });
    }, 800);
  }, [inventoryList, csvFileName, foundIdSet, notFoundIdSet, detectedColumns, organizations, pickRunData, notHereItems, deployReasonFilter, googleState.spreadsheetId, googleState.spreadsheetTitle, googleState.sheetTab, googleState.realtimeSync]);

  // Restore
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const saved = loadFromStorage();
    if (!saved || !saved.inventoryList || saved.inventoryList.length === 0) return;
    setInventoryList(saved.inventoryList); setCsvFileName(saved.csvFileName || ""); setFoundCount(saved.foundCount || 0); setFoundIdSet(new Set(saved.foundIds || [])); setNotFoundIdSet(new Set(saved.notFoundIds || [])); setDetectedColumns(saved.detectedColumns || {}); setOrganizations(saved.organizations || []); setPickRunData(saved.pickRunData || null); setNotHereItems(saved.notHereItems || {}); setDeployReasonFilter(saved.deployReasonFilter || "ALL"); buildLookupMap(saved.inventoryList);
    const restoredFoundMap = new Map<string, boolean>();
    const foundCol = (saved.detectedColumns && saved.detectedColumns.found) || "Found";
    saved.inventoryList.forEach((item) => { if ((item as Record<string, unknown>)[foundCol]) restoredFoundMap.set(item._id, true); });
    setFoundMap(restoredFoundMap);
    setTimeout(() => {
      setUploadStatus(`Session restored — ${saved.inventoryList.length} devices on cart`);
      uploadStatusTimerRef.current = window.setTimeout(() => setUploadStatus(""), 3500);
    }, 0);
  }, [buildLookupMap]);

  // Keep hot-path refs in sync — these don't cause re-renders on scan
  useEffect(() => { inventoryListRef.current = inventoryList; }, [inventoryList]);
  useEffect(() => { foundIdSetRef.current = foundIdSet; }, [foundIdSet]);
  useEffect(() => { notFoundIdSetRef.current = notFoundIdSet; }, [notFoundIdSet]);
  useEffect(() => { detectedColumnsRef.current = detectedColumns; }, [detectedColumns]);
  useEffect(() => { pickRunModeRef.current = pickRunMode; }, [pickRunMode]);

  const clearInventory = useCallback(() => {
    setInventoryList([]); setUploadStatus(""); setCsvFileName(""); setLastScannedCode(""); setLastScanFound(false); setSearchQuery(""); setFoundCount(0); setDetectedColumns({}); setOrganizations([]); setFoundMap(new Map()); setFoundIdSet(new Set()); setNotFoundIdSet(new Set()); setPickRunMode(false); setPickRunData(null); setDeployReasonFilter("ALL"); lookupMapRef.current = new Map(); clearStorage();
    if (fileInputRef.current) fileInputRef.current.value = "";
    setGoogleState((prev) => ({ ...prev, realtimeSync: false, sheetHeaders: [], foundColumnIndex: -1 }));
  }, [setSearchQuery]);

  const detectColumns = (data: Record<string, unknown>[]): Record<string, string> => {
    if (!data || data.length === 0) return {};
    const firstItem = data[0]; const actualKeys = Object.keys(firstItem); const detected: Record<string, string> = {};
    for (const [columnType, names] of Object.entries(COLUMN_MAPPINGS)) {
      for (const name of names) { if (firstItem[name] !== undefined) { detected[columnType] = name; break; } }
      if (detected[columnType]) continue;
      for (const name of names) { const lowerName = name.toLowerCase(); const matchedKey = actualKeys.find((key) => key.toLowerCase() === lowerName); if (matchedKey && firstItem[matchedKey] !== undefined) { detected[columnType] = matchedKey; break; } }
    }
    return detected;
  };

  const onFileChange = useCallback((file: File | null) => {
    if (!file) { clearInventory(); return; }
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".xlsm") || fileName.endsWith(".xlsb")) { setUploadStatus("Error: Excel files must be saved as CSV first."); return; }
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) { setUploadStatus("Error: File is empty or not properly formatted"); clearInventory(); return; }
        const columns = detectColumns(results.data as Record<string, unknown>[]);
        setDetectedColumns(columns);
        if (!columns.inventoryId && !columns.serialNumber) { setUploadStatus("Error: CSV must contain 'inventory_id' or 'serial_number' column"); clearInventory(); return; }
        const uniqueOrganizations = new Set<string>();
        const initialFoundMap = new Map<string, boolean>();
        let initialFoundCount = 0;
        const initialFoundIds = new Set<string>();
        const dataList: InventoryItem[] = (results.data as Record<string, unknown>[]).map((item, index) => {
          const foundValue = getColumnValue(item, "found");
          const foundStatus = foundValue !== null ? parseBoolean(foundValue) : false;
          const orgValue = getColumnValue(item, "organization");
          if (orgValue && orgValue !== "N/A" && orgValue.trim() !== "") uniqueOrganizations.add(orgValue);
          const serialNum = getColumnValue(item, "serialNumber") || "";
          const inventoryId = getColumnValue(item, "inventoryId") || "";
          const uniqueId = `row_${index}_${serialNum}_${inventoryId}`;
          const itemWithFound = columns.found ? { ...item, [columns.found]: foundStatus } : { ...item, Found: foundStatus };
          if (foundStatus) { initialFoundCount++; initialFoundMap.set(uniqueId, true); initialFoundIds.add(uniqueId); }
          return { ...itemWithFound, _id: uniqueId, _rowIndex: index } as InventoryItem;
        });
        setInventoryList(dataList); setFoundMap(initialFoundMap); setFoundIdSet(initialFoundIds); setCsvFileName(file.name); setFoundCount(initialFoundCount); setOrganizations(Array.from(uniqueOrganizations).sort()); setPickRunMode(false); setPickRunData(null); setDeployReasonFilter("ALL"); buildLookupMap(dataList);
        autoStartRef.current = true;
        setUploadStatus(`Loaded ${dataList.length} devices for put away`);
        setLastScannedCode("");
        
      },
      error: (err) => { setUploadStatus(`Error: ${err.message}`); clearInventory(); },
    });
  }, [clearInventory, buildLookupMap]);

  const processScannedCode = useCallback((decodedText: string) => {
    const inv = inventoryListRef.current;
    if (inv.length === 0) { setLastScannedCode(decodedText); setLastScanFound(false); return; }
    const code = normalize(decodedText);
    const foundItemIndex = lookupMapRef.current.get(code);
    if (foundItemIndex !== undefined) {
      const foundItem = inv[foundItemIndex];
      const foundColumnName = detectedColumnsRef.current.found || "Found";
      const isAlreadyFound = foundIdSetRef.current.has(foundItem._id) || !!(foundItem as Record<string, unknown>)[foundColumnName];
      setLastScannedCode(decodedText);
      setLastScanFound(true);
      if (!isAlreadyFound) {
        setFoundIdSet((prev) => { const next = new Set(prev); next.add(foundItem._id); return next; });
        if (notFoundIdSetRef.current.has(foundItem._id)) {
          setNotFoundIdSet((prev) => { const next = new Set(prev); next.delete(foundItem._id); return next; });
        }
        const keysToClear = pickItemKeysByItemIdRef.current.get(foundItem._id) || [];
        if (keysToClear.length > 0) {
          setNotHereItems((prev) => { const next = { ...prev }; keysToClear.forEach((key) => delete next[key]); return next; });
        }
        queueGoogleSyncRef.current?.(foundItem);
      }
      triggerHapticFeedback();
    } else {
      setLastScannedCode(decodedText);
      setLastScanFound(false);
    }
  }, []); // empty deps — reads everything from refs, never recreated

  const exportCSV = useCallback(() => {
    if (inventoryList.length === 0) return;
    const foundColumnName = detectedColumns.found || "Found";
    const exportData = inventoryList.map((item) => { const { _id, _rowIndex, ...exportItem } = item; void _id; void _rowIndex; return setColumnValue(exportItem as Record<string, unknown>, "found", foundIdSet.has(item._id) || !!(item as Record<string, unknown>)[foundColumnName]); });
    const csv = Papa.unparse(exportData as object[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = generateExportFilename(csvFileName); anchor.click(); URL.revokeObjectURL(url);
  }, [inventoryList, csvFileName, foundIdSet, detectedColumns]);

  // Google Sheets Handlers
  const updateGoogleState = useCallback((updates: Partial<GoogleSheetsState>) => { setGoogleState((prev) => ({ ...prev, ...updates })); }, []);

  const handleGoogleSignIn = useCallback(async () => {
    updateGoogleState({ isLoading: true, error: "" });
    try {
      await GSheets.initialize(googleState.clientId); await GSheets.authenticate();
      let recentSpreadsheets: Array<{ id: string; name: string; modifiedTime: string }> = [];
      try { recentSpreadsheets = await GSheets.listRecentSpreadsheets(); } catch { /* ignore */ }
      updateGoogleState({ isSignedIn: true, isLoading: false, recentSpreadsheets, error: "" });
    } catch (error) { updateGoogleState({ isLoading: false, error: `Sign-in failed: ${(error as Error).message}` }); }
  }, [googleState.clientId, updateGoogleState]);

  const handleGoogleSignOut = useCallback(() => { GSheets.signOut(); updateGoogleState({ isSignedIn: false, isConnected: false, spreadsheetId: "", spreadsheetTitle: "", sheetTab: "", sheetTabs: [], realtimeSync: false, recentSpreadsheets: [], error: "", sheetHeaders: [], foundColumnIndex: -1 }); }, [updateGoogleState]);

  const handleGoogleSelectSpreadsheet = useCallback(async (spreadsheetId: string) => {
    updateGoogleState({ isLoading: true, error: "" });
    try {
      const info = await GSheets.getSpreadsheetInfo(spreadsheetId);
      updateGoogleState({ isConnected: true, isLoading: false, spreadsheetId: info.spreadsheetId, spreadsheetTitle: info.title, sheetTabs: info.sheets, sheetTab: info.sheets.length > 0 ? info.sheets[0].title : "", error: "" });
    } catch (error) { updateGoogleState({ isLoading: false, error: `Failed: ${(error as Error).message}` }); }
  }, [updateGoogleState]);

  const handleGoogleSelectTab = useCallback((tabTitle: string) => { updateGoogleState({ sheetTab: tabTitle }); }, [updateGoogleState]);

  const processSheetData = useCallback((data: Record<string, string>[], sourceName: string) => {
    const columns = (() => {
      if (!data || data.length === 0) return {};
      const firstItem = data[0]; const actualKeys = Object.keys(firstItem); const detected: Record<string, string> = {};
      for (const [columnType, names] of Object.entries(COLUMN_MAPPINGS)) { for (const name of names) { if (firstItem[name] !== undefined) { detected[columnType] = name; break; } } if (detected[columnType]) continue; for (const name of names) { const lowerName = name.toLowerCase(); const matchedKey = actualKeys.find((key) => key.toLowerCase() === lowerName); if (matchedKey && firstItem[matchedKey] !== undefined) { detected[columnType] = matchedKey; break; } } }
      return detected;
    })();
    if (!columns.inventoryId && !columns.serialNumber) return { error: "Sheet must contain 'Inventory ID' or 'Serial Number' column" };
    const uniqueOrganizations = new Set<string>(); const initialFoundMap = new Map<string, boolean>(); let initialFoundCount = 0; const initialFoundIds = new Set<string>();
    const dataList: InventoryItem[] = data.map((item, index) => {
      const foundValue = getColumnValue(item as Record<string, unknown>, "found"); const foundStatus = foundValue !== null ? parseBoolean(foundValue) : false;
      const orgValue = getColumnValue(item as Record<string, unknown>, "organization"); if (orgValue && orgValue !== "N/A" && orgValue.trim() !== "") uniqueOrganizations.add(orgValue);
      const serialNum = getColumnValue(item as Record<string, unknown>, "serialNumber") || ""; const inventoryId = getColumnValue(item as Record<string, unknown>, "inventoryId") || "";
      const uniqueId = `row_${index}_${serialNum}_${inventoryId}`;
      const itemWithFound = columns.found ? { ...item, [columns.found]: foundStatus } : { ...item, Found: foundStatus };
      if (foundStatus) { initialFoundCount++; initialFoundMap.set(uniqueId, true); initialFoundIds.add(uniqueId); }
      return { ...itemWithFound, _id: uniqueId, _rowIndex: index } as InventoryItem;
    });
    return { dataList, columns, uniqueOrganizations, initialFoundMap, initialFoundCount, initialFoundIds, sourceName };
  }, []);

  const handleGoogleLoadSheet = useCallback(async () => {
    if (!googleState.spreadsheetId || !googleState.sheetTab) return;
    updateGoogleState({ isLoading: true, error: "" });
    try {
      const sheetData = await GSheets.readSheetData(googleState.spreadsheetId, googleState.sheetTab);
      if (sheetData.rows.length === 0) { updateGoogleState({ isLoading: false, error: "Sheet is empty" }); return; }
      const result = processSheetData(sheetData.rows, `${googleState.spreadsheetTitle} → ${googleState.sheetTab}`);
      if ("error" in result) { updateGoogleState({ isLoading: false, error: result.error as string }); return; }
      const { dataList, columns, uniqueOrganizations, initialFoundMap, initialFoundCount, initialFoundIds } = result as { dataList: InventoryItem[]; columns: Record<string, string>; uniqueOrganizations: Set<string>; initialFoundMap: Map<string, boolean>; initialFoundCount: number; initialFoundIds: Set<string> };
      const foundColName = columns.found || "Found";
      const foundColIdx = GSheets.findColumnIndex(sheetData.headers, foundColName);
      setInventoryList(dataList); setFoundMap(initialFoundMap); setFoundIdSet(initialFoundIds); setCsvFileName(`${googleState.spreadsheetTitle} - ${googleState.sheetTab}`); setFoundCount(initialFoundCount); setDetectedColumns(columns); setOrganizations(Array.from(uniqueOrganizations).sort()); setPickRunMode(false); setPickRunData(null); setDeployReasonFilter("ALL"); buildLookupMap(dataList);
      updateGoogleState({ isLoading: false, error: "", sheetHeaders: sheetData.headers, foundColumnIndex: foundColIdx > 0 ? foundColIdx : -1 });
      setUploadStatus(`Loaded ${dataList.length} items from Google Sheet "${googleState.spreadsheetTitle}" → "${googleState.sheetTab}"`);
      window.clearTimeout(uploadStatusTimerRef.current);
      uploadStatusTimerRef.current = window.setTimeout(() => setUploadStatus(""), 2000);
      setLastScannedCode("");
      
    } catch (error) { updateGoogleState({ isLoading: false, error: `Failed: ${(error as Error).message}` }); }
  }, [googleState.spreadsheetId, googleState.sheetTab, googleState.spreadsheetTitle, updateGoogleState, processSheetData, buildLookupMap]);

  const handleGoogleToggleSync = useCallback(async (enabled: boolean) => {
    if (!enabled) { updateGoogleState({ realtimeSync: false }); return; }
    if (googleState.foundColumnIndex > 0) { updateGoogleState({ realtimeSync: true }); return; }
    const headers = googleState.sheetHeaders; const foundColName = detectedColumns.found || "Found";
    const foundIdx = GSheets.findColumnIndex(headers, foundColName);
    if (foundIdx > 0) { updateGoogleState({ realtimeSync: true, foundColumnIndex: foundIdx }); return; }
    try {
      updateGoogleState({ isLoading: true, error: "" });
      const newColIndex = await GSheets.addHeaderColumn(googleState.spreadsheetId, googleState.sheetTab, "Found", headers.length);
      updateGoogleState({ realtimeSync: true, foundColumnIndex: newColIndex, sheetHeaders: [...headers, "Found"], isLoading: false, error: "" });
    } catch (error) { updateGoogleState({ realtimeSync: false, isLoading: false, error: `Could not add "Found" column: ${(error as Error).message}` }); }
  }, [updateGoogleState, googleState.foundColumnIndex, googleState.sheetHeaders, googleState.spreadsheetId, googleState.sheetTab, detectedColumns]);

  const processSyncQueue = useCallback(async () => {
    if (syncInProgress.current || pendingSyncQueue.current.length === 0) return;
    if (!googleState.realtimeSync || !googleState.spreadsheetId || !googleState.sheetTab || googleState.foundColumnIndex <= 0) return;
    syncInProgress.current = true;
    const batch = [...pendingSyncQueue.current]; pendingSyncQueue.current = [];
    try { await GSheets.batchUpdateCells(googleState.spreadsheetId, googleState.sheetTab, batch.map((entry) => ({ row: entry.rowIndex + 2, column: googleState.foundColumnIndex, value: true as string | boolean }))); } catch { pendingSyncQueue.current.push(...batch); }
    syncInProgress.current = false;
    if (pendingSyncQueue.current.length > 0) setTimeout(processSyncQueue, 500);
  }, [googleState.realtimeSync, googleState.spreadsheetId, googleState.sheetTab, googleState.foundColumnIndex]);

  const queueGoogleSync = useCallback((item: InventoryItem) => {
    if (!googleState.realtimeSync || googleState.foundColumnIndex <= 0) return;
    pendingSyncQueue.current.push({ itemId: item._id, rowIndex: item._rowIndex });
    setTimeout(processSyncQueue, 300);
  }, [googleState.realtimeSync, googleState.foundColumnIndex, processSyncQueue]);

  useEffect(() => { queueGoogleSyncRef.current = queueGoogleSync; }, [queueGoogleSync]);

  useEffect(() => {
    const map = new Map<string, string[]>();
    if (pickRunData) {
      pickRunData.zones.forEach((zone) => {
        zone.items.forEach((pi) => {
          const arr = map.get(pi._id) || [];
          arr.push(pi._pickItemKey);
          map.set(pi._id, arr);
        });
      });
    }
    pickItemKeysByItemIdRef.current = map;
  }, [pickRunData]);

  const handleGoogleExportToSheet = useCallback(async () => {
    if (inventoryList.length === 0 || !googleState.spreadsheetId) return;
    try {
      const foundColumnName = detectedColumns.found || "Found";
      const allKeys = new Set<string>(); inventoryList.forEach((item) => Object.keys(item).forEach((key) => { if (key !== "_id" && key !== "_rowIndex") allKeys.add(key); }));
      const headers = Array.from(allKeys);
      const rows = inventoryList.map((item) => headers.map((header) => { if (header === foundColumnName || header === "Found") return foundIdSet.has(item._id) || !!(item as Record<string, unknown>)[foundColumnName]; const value = (item as Record<string, unknown>)[header]; return value !== null && value !== undefined ? String(value) : ""; }));
      const now = new Date(); const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const newTabTitle = `Scan Results ${timestamp}`;
      await GSheets.exportToNewSheet(googleState.spreadsheetId, newTabTitle, headers, rows);
      const info = await GSheets.getSpreadsheetInfo(googleState.spreadsheetId);
      updateGoogleState({ sheetTabs: info.sheets });
      setUploadStatus(`Exported ${inventoryList.length} items to "${newTabTitle}" ✓`);
    } catch (error) { updateGoogleState({ error: `Export failed: ${(error as Error).message}` }); }
  }, [inventoryList, googleState.spreadsheetId, detectedColumns, foundIdSet, updateGoogleState]);

  const handleGoogleDisconnect = useCallback(() => { updateGoogleState({ isConnected: false, spreadsheetId: "", spreadsheetTitle: "", sheetTab: "", sheetTabs: [], realtimeSync: false, error: "", sheetHeaders: [], foundColumnIndex: -1 }); }, [updateGoogleState]);

  const generatePickRun = useCallback(() => {
    const filteredItems = inventoryList.filter((item) => matchesDeployReasonFilter(item, deployReasonFilter));
    if (filteredItems.length === 0) return;
    const zoneGroups: Record<string, PickRunZone> = {}; const unmapped: InventoryItem[] = [];
    const initialNotHere: Record<string, boolean> = {};
    filteredItems.forEach((item) => {
      const org = getColumnValue(item, "organization"); const entries = getZonesForOrg(org);
      if (entries.length > 0) {
        entries.forEach((entry) => {
          const zone = entry.zone;
          if (!zoneGroups[zone.id]) zoneGroups[zone.id] = { zoneId: zone.id, zoneName: zone.name, section: zone.section, order: zone.order, color: zone.color, items: [] };
          const itemId = getColumnValue(item, "inventoryId") || getColumnValue(item, "serialNumber") || JSON.stringify(item);
          const pickItemKey = `${zone.id}_${itemId}`;
          zoneGroups[zone.id].items.push({ ...item, _shelfPos: entry.shelfPos || 999, _shelfSide: entry.side || "?", _pickItemKey: pickItemKey } as PickItem);
          if (notFoundIdSet.has(item._id)) initialNotHere[pickItemKey] = true;
        });
      } else { unmapped.push(item); }
    });
    Object.values(zoneGroups).forEach((g) => g.items.sort((a, b) => a._shelfPos - b._shelfPos));
    setPickRunData({ zones: Object.values(zoneGroups).sort((a, b) => a.order - b.order), unmapped });
    setNotHereItems(initialNotHere); setPickRunMode(true); setLastScannedCode(""); setLastScanFound(false);
    
  }, [inventoryList, deployReasonFilter, notFoundIdSet]);

  // Auto-start put away run when a new cart is loaded
  useEffect(() => {
    if (autoStartRef.current && inventoryList.length > 0) {
      autoStartRef.current = false;
      generatePickRun();
    }
  }, [inventoryList.length, generatePickRun]);

  // Global keyboard capture (scanner works anywhere without manually focusing the scan box)
  useEffect(() => {
    if (inventoryList.length === 0) return;

    let buffer = "";
    let clearTimer: number | undefined;

    const resetBuffer = () => {
      buffer = "";
      if (clearTimer) window.clearTimeout(clearTimer);
    };

    const armClearTimer = () => {
      if (clearTimer) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        resetBuffer();
      }, 200);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();

      // Don't hijack normal typing in editable controls.
      if (tagName === "select" || tagName === "textarea" || tagName === "input" || target.isContentEditable) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        const code = buffer.trim();
        if (code) {
          processScannedCode(code);
          e.preventDefault();
        }
        resetBuffer();
        return;
      }

      if (e.key.length !== 1) return;

      buffer += e.key;
      armClearTimer();
    };

    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      if (clearTimer) window.clearTimeout(clearTimer);
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [inventoryList.length, processScannedCode]); // processScannedCode is stable (empty deps)


  const previousDeployReasonFilter = useRef(deployReasonFilter);
  useEffect(() => {
    if (pickRunMode && previousDeployReasonFilter.current !== deployReasonFilter) { previousDeployReasonFilter.current = deployReasonFilter; generatePickRun(); }
    if (!pickRunMode) setPickRunData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployReasonFilter, pickRunMode]);

  return (
    <Box maw={700} mx="auto" p="md" pb="xl" style={{ minHeight: "100vh" }}>
      <Card radius="2xl" p={{ base: "md", sm: "xl" }} shadow="xl" style={{ backgroundColor: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>

        {/* Header */}
        <Box mb="lg" style={{ textAlign: "center" }}>
          <Group justify="center" gap="xs" align="center">
            <Title order={2} style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>
              Put Away
            </Title>
            <Tooltip label={isDark ? "Light mode" : "Dark mode"}>
              <ActionIcon variant="subtle" color="gray" onClick={toggleColorScheme} size="sm">
                {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reload page">
              <ActionIcon variant="subtle" color="gray" onClick={() => window.location.reload()} size="sm"><IconRefresh size={15} /></ActionIcon>
            </Tooltip>
          </Group>

          <Group justify="center" mt="xs">
            <Box
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "4px 14px", borderRadius: 999,
                backgroundColor: inventoryList.length > 0 ? "#dcfce7" : "var(--chip-bg)",
                border: `1.5px solid ${inventoryList.length > 0 ? "#86efac" : "var(--item-border)"}`,
              }}
            >
              <Box
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: inventoryList.length > 0 ? "#16a34a" : "var(--text-muted)",
                  ...(inventoryList.length > 0 ? { animation: "scan-pulse 2s ease-in-out infinite" } : {}),
                }}
              />
              <Text size="xs" fw={600} style={{ color: inventoryList.length > 0 ? "#15803d" : "var(--text-secondary)" }}>
                {inventoryList.length > 0 ? "Ready to put away" : "Upload cart to begin"}
              </Text>
            </Box>
          </Group>
        </Box>

        {uploadStatus && (
          <Alert icon={uploadStatus.includes("Error") ? <IconAlertTriangle size={16} /> : <IconCheck size={16} />} color={uploadStatus.includes("Error") ? "red" : "teal"} radius="xl" mb="md">
            {uploadStatus}
          </Alert>
        )}

        {inventoryList.length > 0 && pickRunMode && pickRunData && (
          <PickRunView
            pickRunData={pickRunData} inventoryList={inventoryList} detectedColumns={detectedColumns} foundIdSet={deferredFoundIdSet} onClose={() => setPickRunMode(false)} lastScannedCode={lastScannedCode} lastScanFound={lastScanFound} notHereItems={notHereItems} onScan={processScannedCode}
            onNotHere={(key, isNotHere, itemId) => {
              setNotHereItems((prev) => { const next = { ...prev }; if (isNotHere) next[key] = true; else delete next[key]; return next; });
              if (itemId) setNotFoundIdSet((prev) => { const next = new Set(prev); if (isNotHere) next.add(itemId); else next.delete(itemId); return next; });
            }}
          />
        )}

        {/* Between-runs screen — cart loaded but run not active */}
        {!pickRunMode && inventoryList.length > 0 && (
          <Stack gap="md">
            <Paper radius="xl" p="lg" withBorder style={{ backgroundColor: "var(--section-bg)", borderColor: "var(--item-border)" }}>
              <Group justify="space-between" align="center" mb="sm">
                <Group gap="xs">
                  <ThemeIcon radius="xl" size={32} color="indigo" variant="light">
                    <IconClipboardList size={16} />
                  </ThemeIcon>
                  <Text fw={700} size="sm" style={{ color: "var(--text-primary)" }}>Cart loaded</Text>
                </Group>
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 200 }}>{csvFileName}</Text>
              </Group>
              <SimpleGrid cols={3} spacing="xs">
                {[
                  { value: inventoryList.length, label: "Devices", color: "var(--text-primary)" },
                  { value: foundCount, label: "Put Away", color: "#16a34a" },
                  { value: inventoryList.length - foundCount, label: "Remaining", color: "var(--text-secondary)" },
                ].map((s) => (
                  <Paper key={s.label} p="xs" radius="lg" withBorder style={{ backgroundColor: "var(--item-bg)", textAlign: "center" }}>
                    <Text size="xl" fw={900} style={{ color: s.color, lineHeight: 1.1 }}>{s.value}</Text>
                    <Text size="xs" fw={500} style={{ color: "var(--text-muted)", marginTop: 2 }}>{s.label}</Text>
                  </Paper>
                ))}
              </SimpleGrid>
            </Paper>

            <Button
              fullWidth size="lg"
              leftSection={<IconRoute size={20} />}
              onClick={() => { if (pickRunData) { setPickRunMode(true); } else generatePickRun(); }}
              color="orange"
              variant="filled"
              radius="xl"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              {pickRunData ? "Resume Put Away Run" : "Start Put Away Run"}
            </Button>

            <SimpleGrid cols={2} spacing="sm">
              <Button leftSection={<IconDownload size={16} />} onClick={exportCSV} variant="light" color="indigo" radius="xl">Export CSV</Button>
              <Button leftSection={<IconTrash size={16} />} variant="light" color="red" radius="xl" onClick={() => setShowResetConfirm(true)}>Load New Cart</Button>
            </SimpleGrid>
          </Stack>
        )}

        {/* Upload screen — no cart loaded */}
        {!pickRunMode && inventoryList.length === 0 && (
          <>
            <Divider my="xl" labelPosition="center" label={
              <Text size="xs" fw={700} tt="uppercase" style={{ color: "var(--divider-color)", letterSpacing: "0.08em" }}>Upload Cart</Text>
            } />
            <Stack gap="md">
              <Paper radius="xl" p="lg" style={{ border: "1.5px dashed var(--item-border)", backgroundColor: "var(--section-bg)" }}>
                <Group gap="md" mb="sm">
                  <ThemeIcon radius="xl" size={44} color="indigo" variant="light" style={{ flexShrink: 0 }}>
                    <IconUpload size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="sm" style={{ color: "#3730a3" }}>Upload Device List (CSV)</Text>
                    <Text size="xs" c="dimmed">Devices to put away from cart</Text>
                  </div>
                </Group>
                <FileInput
                  ref={fileInputRef as any}
                  placeholder="Choose file…"
                  accept=".csv,.CSV,.txt,.tsv,.tab"
                  leftSection={<IconUpload size={15} />}
                  onChange={onFileChange}
                  radius="xl"
                  styles={{ input: { backgroundColor: "var(--card-bg)", border: "1.5px solid #e0e7ff" } }}
                />
                <Text size="xs" c="dimmed" ta="center" mt="xs">Supports: Inventory ID · Serial Number · Product Title · Organization</Text>
              </Paper>
              <Divider label={<Text size="xs" c="dimmed" fw={500}>or connect Google Sheets</Text>} labelPosition="center" />
              <GoogleSheetsConnector
                googleState={googleState}
                onSignIn={handleGoogleSignIn}
                onSignOut={handleGoogleSignOut}
                onSelectSpreadsheet={handleGoogleSelectSpreadsheet}
                onSelectTab={handleGoogleSelectTab}
                onLoadSheet={handleGoogleLoadSheet}
                onToggleSync={handleGoogleToggleSync}
                onExportToSheet={handleGoogleExportToSheet}
                onDisconnect={handleGoogleDisconnect}
                hasInventory={inventoryList.length > 0}
                foundCount={foundCount}
                totalCount={inventoryList.length}
              />
            </Stack>
          </>
        )}
      </Card>

      <Modal opened={showResetConfirm} onClose={() => setShowResetConfirm(false)} title={<Text fw={700} size="md">Load New Cart?</Text>} centered radius="xl">
        <Stack gap="md">
          <Text size="sm" c="dimmed" lh={1.6}>This will clear the current cart and all put away progress. This cannot be undone.</Text>
          <SimpleGrid cols={2} spacing="sm">
            <Button variant="default" radius="xl" onClick={() => { setShowResetConfirm(false); }}>Cancel</Button>
            <Button color="red" radius="xl" onClick={() => { setShowResetConfirm(false); clearInventory(); }}>Yes, Load New</Button>
          </SimpleGrid>
        </Stack>
      </Modal>
    </Box>
  );
}

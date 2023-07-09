import { promises as fs } from 'fs';
import cheerio from 'cheerio';
import { glob } from 'glob';

const labelDictionary: Record<string, string> = {
  '駅': 'stations',
  '住所': 'address',
  '総戸数': 'units',
  '構造': 'structure',
  '新築時売主': 'newConstructionSeller',
  '管理会社': 'managementCompany',
  '権利': 'right',
  '小学校区': 'elementarySchoolDistrict',
  '専有面積': 'size',
  'その他': 'other',
  '路線': 'trainLines',
  '竣工年月': 'completionDate',
  '階層': 'floors',
  '施工会社': 'constructionCompany',
  '設計事務所': 'designOffice',
  '管理形態': 'managementForm',
  '用途地域': 'useArea',
  '中学校区': 'middleSchoolDistrict'
};

(async () => {
  //const apartments = [];
  const pagePaths = await glob('../home-research/apartment-pages/*.html');
  /*let i = 0;
  for (const pagePath of pagePaths.slice(0,50)) {
    console.log(`processing [${i++}] of [${pagePaths.length}]`)
    const apartment= await run(pagePath);
    apartments.push(apartment);
  }*/
  const apartments = await Promise.all(pagePaths.map((pagePath) => run(pagePath)));
  await fs.writeFile('apartments.json', JSON.stringify(apartments, null, 2));
  debugger;
})();

let finished = 0;
async function run(pagePath: string) { // 10110 has both, 168385 has only sales
  const html = (await fs.readFile(pagePath)).toString(); // '../home-research/apartment-pages/168385.html
  const $ = cheerio.load(html);
  const buildingName = getName($);
  const info = getInfo($);
  const city = getCity($);
  const town = getTown($);
  const mansionReview = getMansionReview($);
  const salesHistory = getSalesHistory($);
  const salesMarketValueTimeseriesData = getSalesMarketValueTimeseriesData($);
  const rentalHistory = getRentalHistory($);
  const rentalMarketValueTimeseriesData = getRentalMarketValueTimeseriesData($);
  const estimatedPrices = getEstimatedPrices($);

  if (finished % 100 === 0) {
    console.log(`finished ${finished} of 10,000`);
  }
  finished += 1;
  return {
    buildingName,
    info,
    city,
    town,
    mansionReview,
    salesHistory,
    salesMarketValueTimeseriesData,
    rentalHistory,
    rentalMarketValueTimeseriesData,
    estimatedPrices,
    pagePath
  };
}

function getEstimatedPrices($: cheerio.Root) {
  const $salesAppraisal = $('ul > li > div.baikyaku');
  const salesAppraisalFromAmount = Number($($salesAppraisal).find('div.from p.amount span.em').text().trim().replace(/[^\d.]/g, '')) * 10000 || null; // man yen
  const salesAppraisalFromAmountPerTsubo = Number($($salesAppraisal).find('div.from p.tanka span.em').text().trim().replace(/[^\d.]/g, '')) || null; // yen per tsubo
  const salesAppraisalToAmount = Number($($salesAppraisal).find('div.to p.amount span.em').text().trim().replace(/[^\d.]/g, '')) * 10000 || null; // man yen
  const salesAppraisalToAmountPerTsubo = Number($($salesAppraisal).find('div.to p.tanka span.em').text().trim().replace(/[^\d.]/g, '')) || null; // yen per tsubo

  const $rentAppraisal = $('ul > li > div.chintai');
  const rentAppraisalFromAmount = Number($($rentAppraisal).find('div.from p.amount span.em').text().trim().replace(/[^\d.]/g, '')) * 10000 || null; // man yen
  const rentAppraisalFromAmountPerTsubo = Number($($rentAppraisal).find('div.from p.tanka span.em').text().trim().replace(/[^\d.]/g, '')) || null; // yen per tsubo
  const rentAppraisalToAmount = Number($($rentAppraisal).find('div.to p.amount span.em').text().trim().replace(/[^\d.]/g, '')) * 10000 || null; // man yen
  const rentAppraisalToAmountPerTsubo = Number($($rentAppraisal).find('div.to p.tanka span.em').text().trim().replace(/[^\d.]/g, '')) || null; // yen per tsubo

  const grossYield = Number($('ul > li > div.yield p.percent span.em').text().trim()) / 100 || null;

  return {
    salesAppraisalFromAmount,
    salesAppraisalFromAmountPerTsubo,
    salesAppraisalToAmount,
    salesAppraisalToAmountPerTsubo,
    rentAppraisalFromAmount,
    rentAppraisalFromAmountPerTsubo,
    rentAppraisalToAmount,
    rentAppraisalToAmountPerTsubo,
    grossYield
  };
}

function getSalesMarketValueTimeseriesData($: cheerio.Root) {
  const $script = $('#js_sale_souba_chart script.js_chart_data');
  if ($script.length) {
    return JSON.parse($($script).text());
  }

  return null;
}

function getRentalMarketValueTimeseriesData($: cheerio.Root) {
  const $script = $('#js_chintai_souba_chart script.js_chart_data');
  if ($script.length) {
    return JSON.parse($($script).text());
  }

  return null;
}

function getSalesHistory($: cheerio.Root) {
  const $rows = $('div.mansionSaleHistoryRow table.tekisei_kakaku_sindan_list_area tbody.display tr');
  const histories = [];
  for (const $row of $rows) {
    const $cells = $($row).find('td');
    histories.push({
      salesDate: parseJapaneseDate($($cells[1]).text().trim()),
      floor: Number($($cells[2]).text().trim().replace('階', '')),
      floorPlan: $($cells[3]).text().trim() || null,
      direction: $($cells[4]).text().trim() || null,
      size: Number($($cells[5]).text().trim()),
      balconySize: Number($($cells[6]).text().trim()),
      sellingPrice: Number($($cells[7]).text().trim().replace(/[^\d.]/g, '')) * 10000, // man yen
      pricePerTsubo: Number($($cells[8]).text().trim()) * 10000, // man yen
    });
  }
  return histories;
}

function getRentalHistory($: cheerio.Root) {
  const $rows = $('#chintaiHistoryBlock table.mansionOrderContentList tbody:first-child tr');
  const histories = [];
  for (const $row of $rows) {
    const $cells = $($row).find('td');
    if ($cells.length === 0) {
      // skip header row (data rows contain td's not th's)
      continue;
    }

    histories.push({
      leaseDate: parseJapaneseDate($($cells[0]).text().trim()),
      rent: Number($($cells[1]).text().trim().replace(/[^\d.]/g, '')),
      pricePerTsubo: Number($($cells[2]).text().trim().replace(/[^\d.]/g, '')),
      managementFee: Number($($cells[3]).text().trim().replace(/[^\d.]/g, '')),
      deposit: Number($($cells[4]).text().trim().replace(/[^\d.]/g, '')),
      keyMoney: Number($($cells[5]).text().trim().replace(/[^\d.]/g, '')),
      deposit2: Number($($cells[6]).text().trim().replace(/[^\d.]/g, '')),
      floor: Number($($cells[7]).text().trim().replace('階', '')),
      size: Number($($cells[8]).text().trim().replace(/[^\d.]/g, '')),
      floorPlan: $($cells[9]).text().trim(),
      direction: $($cells[10]).text().trim(),
    });
  }
  return histories;
}

function getMansionReview($: cheerio.Root) {
  const cells = $('.deviation_value td');
  const deviation = Number($(cells[0]).find('p').text().trim()) || null;
  const cityRankingVal = Number($(cells[1]).find('.val').text().trim().replace(/[位,]/g, '')) || null;
  const cityRankingCap = Number($(cells[1]).find('.cap').text().trim().replace(/[^\d.]/g, '')) || null;
  const townRankingVal = Number($(cells[2]).find('.val').text().trim().replace(/[位,]/g, '')) || null;
  const townRankingCap = Number($(cells[2]).find('.cap').text().trim().replace(/[^\d.]/g, '')) || null;
  return {
    deviation,
    cityRankingVal,
    cityRankingCap,
    townRankingVal,
    townRankingCap
  }
}

function getName($: cheerio.Root) {
  return $('.page_title span').text().trim();
}
function getTown($: cheerio.Root) {
  const breadcrumbs = $('#pankuzu a');
  const city = $(breadcrumbs[2]).text().trim().replace('のマンション', '');
  return $(breadcrumbs[3])
    .text()
    .trim()
    .replace(city, '')
    .replace('のマンション', '');
}

function getCity($: cheerio.Root) {
  const breadcrumbs = $('#pankuzu a');
  return $(breadcrumbs[2]).text().trim().replace('のマンション', '');
}

function getInfo($: cheerio.Root) {
  const $list = $('.mansion_info ul li');
  const info: Record<string, any> = {};
  for (const $item of $list) {
    const label = translateInfoLabel($($item).find('span.named').text().trim());
    const rawValue = $($item).find('p').text().trim();
    let finalValue;

    switch(label) {
      case 'stations':
        finalValue = parseStationDistances(rawValue);
        break;
      case 'address':
        finalValue = $($item).find('p')
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .trim();
        break;
      case 'units':
        finalValue = Number(rawValue.replace('戸', ''));
        break;
      case 'size':
        finalValue = parseApartmentSizeRange(rawValue);
        break;
      case 'trainLines':
        finalValue = parseStationLines(rawValue);
        break;
      case 'completionDate':
        finalValue = parseJapaneseDate(rawValue);
        break;
      case 'floors':
        finalValue = parseBuildingFloors(rawValue);
        break;
      default:
        finalValue = rawValue;
    }

    info[label] = finalValue;
  }

  return info;
}

// utils
type StationDistance = {
  stationName: string;
  minutes: number;
};

function parseStationDistances(input: string): StationDistance[] {
  const result: StationDistance[] = [];

  const lines = input.split('\n');
  const regex = /(.+駅)より徒歩で(\d+)分/;

  for (const line of lines) {
    const match = line.match(regex);

    if (match) {
      const stationName = match[1].trim();
      const minutes = parseInt(match[2].trim(), 10);
      result.push({ stationName, minutes });
    }
  }

  return result;
}

type ApartmentSizeRange = {
  minSize: number;
  maxSize: number;
};

function parseApartmentSizeRange(input: string): ApartmentSizeRange | null {
  const regex = /(\d+(?:\.\d+)?)㎡\s*～\s*(\d+(?:\.\d+)?)㎡/;
  const match = input.match(regex);

  if (match) {
    return {
      minSize: parseFloat(match[1]),
      maxSize: parseFloat(match[2]),
    };
  }

  return null;
}

type StationLines = {
  stationName: string;
  lines: string[];
};

function parseStationLines(input: string): StationLines[] {
  const result: StationLines[] = [];

  const lines = input.split('\n');
  const stationRegex = /『(.+駅)』/;
  const trainLineRegex = /(\S+線)/g;

  for (const line of lines) {
    const stationMatch = line.match(stationRegex);
    const trainLineMatches = line.match(trainLineRegex);

    if (stationMatch && trainLineMatches) {
      result.push({
        stationName: stationMatch[1],
        lines: trainLineMatches,
      });
    }
  }

  return result;
}

type ParsedDate = {
  year: number;
  month: number;
};

function parseJapaneseDate(input: string): ParsedDate | null {
  const regex = /(\d+)年(?:([1-9]|1[0-2])月)?/;
  const match = input.match(regex);

  if (match) {
    const year = parseInt(match[1], 10);
    const month = match[2] ? parseInt(match[2], 10) : 1;
    return { year, month };
  }

  return null;
}

type BuildingFloors = {
  above: number;
  below: number;
};

function parseBuildingFloors(input: string): BuildingFloors {
  const aboveRegex = /地上(\d+)/;
  const belowRegex = /地下(\d+)/;

  const aboveMatch = input.match(aboveRegex);
  const belowMatch = input.match(belowRegex);

  const above = aboveMatch ? parseInt(aboveMatch[1], 10) : 0;
  const below = belowMatch ? parseInt(belowMatch[1], 10) : 0;

  return { above, below };
}

function translateInfoLabel(label: string) {
  return labelDictionary[label] ?? label;
}

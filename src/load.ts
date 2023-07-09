import { promises as fs } from 'fs';
import axios from 'axios';
import { mapLimit } from 'async';

type Point = {
  type: string;
  coordinates: [number, number];
};

type GeocodePoint = Point & {
  calculationMethod: string;
  usageTypes: string[];
};

type Address = {
  addressLine: string;
  adminDistrict: string;
  countryRegion: string;
  formattedAddress: string;
  locality: string;
  postalCode: string;
};

type Resource = {
  __type: string;
  bbox: [number];
  name: string;
  point: Point;
  address: Address;
  confidence: string;
  entityType: string;
  geocodePoints: GeocodePoint[];
  matchCodes: string[];
};

type ResourceSet = {
  estimatedTotal: number;
  resources: Resource[];
};

type ResponseData = {
  authenticationResultCode: string;
  brandLogoUri: string;
  copyright: string;
  resourceSets: ResourceSet[];
  statusCode: number;
  statusDescription: string;
  traceId: string;
};

(async () => {
  await run();
})();

async function run() {
  const json = (await fs.readFile('apartments.json')).toString();
  const data = JSON.parse(json);
  const first = data[0];
  inspect(data);
  //const jsonl = await generateJsonl(data);

  //await fs.writeFile('sales.jsonl', jsonl.join('\n'));
  //console.log('done');
}

function inspect(apartment: object) {
  debugger;
}

interface Apartment {
  buildingName: string,
  info: { address: string },
  city: string,
  town: string,
  mansionReview: {},
  pagePath: string,
  estimatedPrices: {},
  salesHistory: [{}],
  lat: number,
  long: number,
  postalCode: string,
}

async function generateJsonl(apartments: Array<Apartment>) {
  const rows = [];

  // first enhance apartments with geo data
  let i = 0;
  await mapLimit(apartments, 3, async (apartment, done) => {
    if (!apartment.info?.address) return done();
    const geo = await getAddressData(apartment.info.address);
    const [resourceSet] = (geo.resourceSets || []);
    if (!resourceSet) return done();
    const [resource] = (resourceSet.resources || []);
    if (!resource) done();

    apartment.lat = resource.geocodePoints[0].coordinates[0];
    apartment.long = resource.geocodePoints[0].coordinates[1];
    apartment.postalCode = resource.address.postalCode;
    console.log(`geocoded [${i++}] of [${apartments.length}]`);
    done();
  });

  for (const apartment of apartments) {
    try {
      // @ts-ignore
      delete apartment.info[''];
    } catch (err) {
      console.log('error deleting');
    }
    const base = {
      buildingName: apartment.buildingName,
      info: apartment.info,
      city: apartment.city,
      town: apartment.town,
      mansionReview: apartment.mansionReview,
      pagePath: apartment.pagePath,
      estimatedPrices: apartment.estimatedPrices,
      lat: apartment.lat,
      long: apartment.long,
      postalCode: apartment.postalCode,
      salesHistory: apartment.salesHistory
    };

    rows.push(JSON.stringify(base));

    /*for (const history of apartment.salesHistory) {
      rows.push(JSON.stringify({
        ...base,
        saleHistory: history
      }));
    }*/
  }
  return rows;
}

async function getAddressData(address: string): Promise<ResponseData> {
  const baseUrl = 'https://dev.virtualearth.net/REST/v1/Locations';
  const apiKey = 'Arl-Vxo1e39XuzRU8hDBv65yV5zCrgQUJHFWxe7-92GPfxUcHsViBkXnZZSCw0TG';

  const response = await axios.get(baseUrl, {
    params: {
      countryRegion: 'JP',
      adminDistrict: '東京都',
      addressLine: address,
      culture: 'ja',
      key: apiKey,
    },
  });

  return response.data as ResponseData;
}

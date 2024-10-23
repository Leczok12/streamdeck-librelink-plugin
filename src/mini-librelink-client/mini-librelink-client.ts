import axios from 'axios';
import { LoginRedirectResponse, LoginResponse } from './types/login';
import { AE, CountryResponse, RegionalMap } from './types/countries';
import { ConnectionsResponse, Datum } from './types/connections';
import { ActiveSensor, Connection, GlucoseItem } from './types/connection';
import { Data, GraphData } from './types/graph';
import { LibreCgmData, trendMap } from './types/client';

const path = {
    login: '/llu/auth/login',
    connections: '/llu/connections',
    countries: '/llu/config/country?country=DE'
};

export type clientConfig = {
    email: string;
    password: string;
    version?: string;
};

export type MiniLibrelinkClient = {
    login: () => Promise<LoginResponse>;
    readRaw: () => Promise<Data>;
    read: () => Promise<LibreCgmData>;
};

export const miniLibrelinkClient = ({ email, password, version }: clientConfig) => {
    let baseURL = 'https://api-us.libreview.io';
    let jwtToken: string | null = null;
    let connectionId: string | null = null;

    const instance = axios.create({
        baseURL: baseURL,
        headers: {
            'accept-encoding': 'gzip',
            'cache-control': 'no-cache',
            connection: 'Keep-Alive',
            'content-type': 'application/json',
            product: 'llu.android',
            version: version ?? '4.9.0'
        }
    });
    instance.interceptors.request.use(
        (config) => {
            if (jwtToken && config.headers) {
                // eslint-disable-next-line no-param-reassign
                config.headers.authorization = `Bearer ${jwtToken}`;
            }

            return config;
        },
        (e) => e,
        { synchronous: true }
    );

    const login = async (): Promise<LoginResponse> => {
        const res = await instance.post<LoginResponse | LoginRedirectResponse>(path.login, {
            email: email,
            password: password
        });
        if (res.status !== 200) throw new Error(`Http error : ${res.status}`);
        if (res.data.status == 2) throw new Error(`Bad credentials | Api error : ${res.data.status}`);
        if (res.data.status == 4) throw new Error(`Api error : ${res.data.status}`);

        if ((res.data as LoginRedirectResponse).data.redirect) {
            const redirectRes = res.data as LoginRedirectResponse;
            const countryNodes = await instance.get<CountryResponse>(path.countries);
            const targetRegion = redirectRes.data.region as keyof RegionalMap;
            const regionDefinition: AE | undefined = countryNodes.data.data.regionalMap[targetRegion];

            if (!regionDefinition) throw new Error('unknown region');

            instance.defaults.baseURL = regionDefinition.lslApi;
            return login();
        }

        jwtToken = (res.data as LoginResponse).data.authTicket.token;
        return res.data as LoginResponse;
    };

    const getConnections = async () => {
        if (!jwtToken) throw new Error('Undefined jwtToken, login first');

        const res = await instance.get<ConnectionsResponse>(path.connections);
        if (res.status !== 200) throw new Error(`Http error : ${res.status}`);
        return res.data;
    };

    const getConnection = (connections: Datum[]): string => {
        return connections[0].patientId;
    };

    const readRaw = async () => {
        if (!connectionId) {
            const conections = await getConnections();
            if (conections.data.length === 0) throw new Error('You dont have any patients');

            connectionId = getConnection(conections.data);
        }

        const res = await instance.get<GraphData>(`${path.connections}/${connectionId}/graph`);
        if (res.status !== 200) throw new Error(`Http error : ${res.status}`);
        return res.data.data;
    };

    const read = async () => {
        const raw = await readRaw();
        const data: LibreCgmData = {
            valueMgdl: raw.connection.glucoseMeasurement.Value,
            valueMmol: raw.connection.glucoseMeasurement.Value / 18,
            isHigh: raw.connection.glucoseMeasurement.Value >= raw.connection.targetHigh,
            isLow: raw.connection.glucoseMeasurement.Value <= raw.connection.targetLow,
            state: (() => {
                if (raw.connection.glucoseMeasurement.Value >= raw.connection.targetHigh) return 'high';
                if (raw.connection.glucoseMeasurement.Value <= raw.connection.targetLow) return 'low';
                return 'ok';
            })(),
            trend_name: trendMap[raw.connection.glucoseMeasurement.TrendArrow ?? 3] ?? 'Flat',
            trend_value: raw.connection.glucoseMeasurement.TrendArrow ?? 3
        };

        return data;
    };

    return { login, readRaw, read };
};

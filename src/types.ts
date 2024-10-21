export type Settings = {
    email: string;
    password: string;
    unit: 'mmol' | 'mgdl';
    // theme: 'dark' | 'light';
};

export type GlucoseData = {
    value: string;
    trend: 'flat' | 'falling' | 'rising' | 'unknow';
    type: 'low' | 'high' | 'ok';
};

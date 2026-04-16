export interface IndicatorGlossaryInfo {
    title: string;
    whatIsIt: string;
    whenToBeConcerned: string[];
    whatToDoNext: string[];
    notes?: string;
    source: 'indicator' | 'organ' | 'fallback';
}

interface IndicatorGlossaryEntry {
    whatIsIt: string;
    whenToBeConcerned: string[];
    whatToDoNext: string[];
    notes?: string;
}

const INDICATOR_ENTRIES: Record<string, IndicatorGlossaryEntry> = {
    plateletcrit: {
        whatIsIt: 'Plateletcrit (PCT) estimates how much of your blood volume is made up of platelets, which are cells that support clotting.',
        whenToBeConcerned: [
            'A persistent low value can suggest reduced platelet mass and should be reviewed with your clinician, especially if bruising or bleeding appears.',
            'A persistently high value can reflect increased platelet activity and may require clinical context to assess clotting risk.'
        ],
        whatToDoNext: [
            'Review platelet count and mean platelet volume together, because PCT is best interpreted with related platelet markers.',
            'Discuss trend changes with your healthcare provider rather than relying on a single result.',
            'Seek urgent care if you have active bleeding, severe headache, chest pain, or shortness of breath.'
        ]
    },
    platelet_count: {
        whatIsIt: 'Platelet count measures how many platelets are present in your blood and helps assess clotting capacity.',
        whenToBeConcerned: [
            'Low counts can increase bleeding risk, particularly if symptoms such as nosebleeds, gum bleeding, or easy bruising appear.',
            'Very high counts can increase clotting risk in some clinical contexts and should be evaluated with your provider.'
        ],
        whatToDoNext: [
            'Compare with prior platelet results to see if this is a temporary change or a trend.',
            'Follow your clinician guidance on repeat testing and possible additional blood work.',
            'Go to urgent care immediately if there is uncontrolled bleeding or neurologic symptoms.'
        ]
    },
    hemoglobin: {
        whatIsIt: 'Hemoglobin is the oxygen-carrying protein in red blood cells and is central to oxygen delivery throughout the body.',
        whenToBeConcerned: [
            'Low values can indicate anemia and may cause fatigue, dizziness, or shortness of breath.',
            'High values can be linked to dehydration, chronic low-oxygen states, or other causes that need evaluation.'
        ],
        whatToDoNext: [
            'Review with hematocrit and red blood cell indices for better interpretation.',
            'Discuss possible causes and whether iron, vitamin, kidney, or inflammatory testing is needed.',
            'Seek urgent care for chest pain, severe shortness of breath, or fainting.'
        ]
    },
    hematocrit: {
        whatIsIt: 'Hematocrit represents the proportion of blood volume occupied by red blood cells.',
        whenToBeConcerned: [
            'Low hematocrit may reflect anemia or blood loss.',
            'High hematocrit can occur with dehydration or conditions that increase red cell concentration.'
        ],
        whatToDoNext: [
            'Interpret together with hemoglobin and red cell count.',
            'Hydrate well and follow repeat testing advice if your clinician recommends it.',
            'Contact your provider promptly if symptoms worsen or new symptoms appear.'
        ]
    },
    white_blood_cell_count: {
        whatIsIt: 'White blood cell (WBC) count reflects immune cell levels and can indicate infection, inflammation, or marrow-related changes.',
        whenToBeConcerned: [
            'High WBC can suggest infection, inflammation, stress response, or other systemic conditions.',
            'Low WBC can increase infection vulnerability and warrants timely clinical follow-up.'
        ],
        whatToDoNext: [
            'Review with differential counts such as neutrophils and lymphocytes.',
            'Monitor fever or infection symptoms and report them quickly to your care team.',
            'Seek urgent care for persistent high fever, confusion, or breathing difficulty.'
        ]
    },
    neutrophils: {
        whatIsIt: 'Neutrophils are a major type of white blood cell that helps fight bacterial and acute infections.',
        whenToBeConcerned: [
            'High neutrophils can occur with infection, inflammation, steroid effects, or physiologic stress.',
            'Low neutrophils can increase risk of serious infection, especially with fever.'
        ],
        whatToDoNext: [
            'Check absolute neutrophil count and clinical symptoms together.',
            'Follow clinician instructions on repeat CBC and infection precautions.',
            'Seek urgent care for fever with low neutrophils.'
        ]
    },
    creatinine: {
        whatIsIt: 'Creatinine is a waste product filtered by the kidneys and is commonly used to monitor kidney function.',
        whenToBeConcerned: [
            'Rising creatinine may indicate reduced kidney filtration or acute kidney stress.',
            'Sudden changes or persistent abnormalities should be assessed quickly, especially with swelling or reduced urine output.'
        ],
        whatToDoNext: [
            'Interpret with eGFR, hydration status, medications, and blood pressure history.',
            'Avoid unadvised nephrotoxic substances and follow medical guidance on repeat testing.',
            'Seek urgent care for severe swelling, very low urine output, or shortness of breath.'
        ]
    },
    egfr: {
        whatIsIt: 'Estimated glomerular filtration rate (eGFR) is a calculated indicator of kidney filtering capacity.',
        whenToBeConcerned: [
            'Persistently low eGFR can suggest chronic kidney dysfunction and should be staged clinically.',
            'Rapid decline from previous values requires prompt evaluation.'
        ],
        whatToDoNext: [
            'Review trend over time and pair with creatinine and urine findings.',
            'Discuss blood pressure, diabetes control, and medication safety with your clinician.',
            'Follow follow-up timing strictly if advised by nephrology or primary care.'
        ]
    },
    alt: {
        whatIsIt: 'ALT is a liver enzyme that can rise when liver cells are inflamed or injured.',
        whenToBeConcerned: [
            'Mild elevation may be temporary, but persistent or significant elevation needs assessment.',
            'Elevation with jaundice, abdominal pain, or dark urine should be addressed urgently.'
        ],
        whatToDoNext: [
            'Interpret with AST, bilirubin, and clinical history including alcohol, medications, and metabolic factors.',
            'Avoid alcohol and unnecessary hepatotoxic agents until reviewed by your clinician.',
            'Seek urgent care if warning symptoms of liver injury appear.'
        ]
    },
    ast: {
        whatIsIt: 'AST is an enzyme found in liver, muscle, and other tissues; elevation is interpreted with ALT and clinical context.',
        whenToBeConcerned: [
            'Persistent or marked elevation can indicate liver or muscle injury and requires follow-up.',
            'Concurrent symptoms or other abnormal liver markers increase concern.'
        ],
        whatToDoNext: [
            'Review together with ALT and additional liver tests.',
            'Share recent exercise, medications, and alcohol history with your provider.',
            'Follow recommended repeat testing and escalation guidance.'
        ]
    },
    fasting_glucose: {
        whatIsIt: 'Fasting glucose measures blood sugar after a fasting period and is used to screen metabolic control.',
        whenToBeConcerned: [
            'Repeated elevated fasting glucose may indicate prediabetes or diabetes risk.',
            'Very high values with dehydration, confusion, or vomiting need urgent assessment.'
        ],
        whatToDoNext: [
            'Review with HbA1c and lifestyle factors such as diet, activity, sleep, and weight.',
            'Track trends rather than a single value when possible.',
            'Contact care promptly for severe hyperglycemia symptoms.'
        ]
    },
    hba1c: {
        whatIsIt: 'HbA1c estimates average blood glucose over the past two to three months.',
        whenToBeConcerned: [
            'Higher HbA1c suggests sustained glucose elevation and higher long-term metabolic risk.',
            'Unexpected changes should be interpreted with current glucose, treatment plan, and conditions affecting red blood cells.'
        ],
        whatToDoNext: [
            'Review individualized target ranges with your clinician.',
            'Adjust lifestyle and treatment plans based on clinical advice.',
            'Repeat monitoring at clinician-recommended intervals.'
        ]
    }
};

const INDICATOR_ALIASES: Record<string, string> = {
    pct: 'plateletcrit',
    plateletcrit: 'plateletcrit',
    platelet_crit: 'plateletcrit',
    platelet_count: 'platelet_count',
    platelets: 'platelet_count',
    plt: 'platelet_count',
    hgb: 'hemoglobin',
    hemoglobin: 'hemoglobin',
    hct: 'hematocrit',
    hematocrit: 'hematocrit',
    wbc: 'white_blood_cell_count',
    wbc_count: 'white_blood_cell_count',
    white_blood_cells: 'white_blood_cell_count',
    neutrophil: 'neutrophils',
    neutrophils: 'neutrophils',
    creatinine: 'creatinine',
    serum_creatinine: 'creatinine',
    egfr: 'egfr',
    e_gfr: 'egfr',
    alt: 'alt',
    sgpt: 'alt',
    ast: 'ast',
    sgot: 'ast',
    fasting_glucose: 'fasting_glucose',
    glucose_fasting: 'fasting_glucose',
    fpg: 'fasting_glucose',
    hba1c: 'hba1c',
    a1c: 'hba1c'
};

const ORGAN_FALLBACK: Record<string, IndicatorGlossaryEntry> = {
    kidneys: {
        whatIsIt: 'This marker is related to kidney filtering or kidney stress status.',
        whenToBeConcerned: [
            'Persistent abnormal trends may suggest declining kidney function and should be clinically reviewed.',
            'Symptoms such as edema, reduced urine output, or shortness of breath need urgent attention.'
        ],
        whatToDoNext: [
            'Review trends with your clinician and check kidney-related companion markers.',
            'Follow hydration and medication advice from your care team.'
        ]
    },
    liver: {
        whatIsIt: 'This marker is related to liver cell function, inflammation, or liver stress.',
        whenToBeConcerned: [
            'Persistent elevation or combined abnormalities can indicate meaningful liver stress.',
            'Jaundice, dark urine, or persistent abdominal pain should be assessed urgently.'
        ],
        whatToDoNext: [
            'Review with full liver panel trends and medication/alcohol history.',
            'Follow clinician-directed repeat testing and escalation guidance.'
        ]
    },
    heart: {
        whatIsIt: 'This marker is linked to cardiovascular risk or heart-related physiology.',
        whenToBeConcerned: [
            'Abnormal results may increase cardiovascular risk and require context-based interpretation.',
            'Chest pain, severe breathlessness, or fainting requires emergency evaluation.'
        ],
        whatToDoNext: [
            'Review full risk profile with your clinician, including blood pressure and symptom history.',
            'Follow recommended monitoring and emergency instructions.'
        ]
    },
    lungs: {
        whatIsIt: 'This marker may be associated with oxygenation, inflammation, or pulmonary stress context.',
        whenToBeConcerned: [
            'Persistent abnormalities with breathing symptoms should be reviewed quickly.',
            'Rapidly worsening shortness of breath needs urgent care.'
        ],
        whatToDoNext: [
            'Track respiratory symptoms and review trends with your provider.',
            'Escalate immediately if breathing distress appears.'
        ]
    },
    blood: {
        whatIsIt: 'This marker belongs to blood count or blood chemistry interpretation.',
        whenToBeConcerned: [
            'Persistent deviations may indicate anemia, infection, inflammation, or clotting-related issues.',
            'Severe bleeding, high fever, or neurologic symptoms require urgent care.'
        ],
        whatToDoNext: [
            'Interpret this marker with related CBC and differential values.',
            'Follow repeat testing schedule advised by your clinician.'
        ]
    },
    pancreas: {
        whatIsIt: 'This marker is commonly used in glucose and metabolic regulation assessment.',
        whenToBeConcerned: [
            'Persistent high glucose-related markers may raise metabolic and vascular risk.',
            'Severe hyperglycemia symptoms need urgent evaluation.'
        ],
        whatToDoNext: [
            'Track trends and align lifestyle or treatment actions with clinician guidance.',
            'Follow structured follow-up intervals for metabolic monitoring.'
        ]
    },
    thyroid: {
        whatIsIt: 'This marker may reflect thyroid hormone regulation and endocrine balance.',
        whenToBeConcerned: [
            'Persistent abnormalities can affect energy, heart rate, and metabolism.',
            'Significant symptom changes should prompt timely review.'
        ],
        whatToDoNext: [
            'Review with thyroid panel context and symptom history.',
            'Follow repeat testing and endocrine guidance from your clinician.'
        ]
    },
    bone: {
        whatIsIt: 'This marker may be related to bone turnover, mineral status, or musculoskeletal health.',
        whenToBeConcerned: [
            'Persistent abnormalities can be linked to nutritional, hormonal, or metabolic issues.',
            'Severe bone pain or fracture risk concerns should be clinically assessed.'
        ],
        whatToDoNext: [
            'Review alongside calcium, vitamin D, and related markers when available.',
            'Follow clinician recommendations for supplementation or further workup.'
        ]
    },
    immune: {
        whatIsIt: 'This marker reflects part of immune activity or inflammatory response.',
        whenToBeConcerned: [
            'Sustained abnormalities can indicate active inflammation or altered immune status.',
            'Persistent fever or systemic symptoms requires timely evaluation.'
        ],
        whatToDoNext: [
            'Interpret with related immune and infection markers.',
            'Escalate quickly if symptoms worsen or new warning signs appear.'
        ]
    }
};

const GENERIC_FALLBACK: IndicatorGlossaryEntry = {
    whatIsIt: 'This indicator is part of your lab profile and should be interpreted together with reference range, symptom context, and trend over time.',
    whenToBeConcerned: [
        'Be more concerned when the value is clearly outside the reference range, worsening over time, or paired with symptoms.',
        'Urgent symptoms should always be evaluated immediately, regardless of a single lab value.'
    ],
    whatToDoNext: [
        'Review this result with your healthcare provider in context of your full report.',
        'Compare with prior labs to identify trend direction.',
        'Follow clinician guidance for repeat tests and escalation triggers.'
    ]
};

function normalizeIndicatorKey(rawValue: string) {
    return String(rawValue || '')
        .trim()
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function toInfo(title: string, entry: IndicatorGlossaryEntry, source: IndicatorGlossaryInfo['source']): IndicatorGlossaryInfo {
    return {
        title,
        whatIsIt: entry.whatIsIt,
        whenToBeConcerned: [...entry.whenToBeConcerned],
        whatToDoNext: [...entry.whatToDoNext],
        notes: entry.notes,
        source
    };
}

export function resolveIndicatorGlossary(indicatorName: string, organId: string): IndicatorGlossaryInfo {
    const cleanedName = String(indicatorName || '').trim();
    const normalizedIndicator = normalizeIndicatorKey(cleanedName);
    const aliasMatch = INDICATOR_ALIASES[normalizedIndicator] || normalizedIndicator;

    if (INDICATOR_ENTRIES[aliasMatch]) {
        return toInfo(cleanedName || aliasMatch, INDICATOR_ENTRIES[aliasMatch], 'indicator');
    }

    const normalizedOrgan = String(organId || '').trim().toLowerCase();
    if (ORGAN_FALLBACK[normalizedOrgan]) {
        return toInfo(cleanedName || 'Lab indicator', ORGAN_FALLBACK[normalizedOrgan], 'organ');
    }

    return toInfo(cleanedName || 'Lab indicator', GENERIC_FALLBACK, 'fallback');
}

-- ============================================================================
-- PLATAFORMA DE SAÚDE, PERFORMANCE E NUTRIÇÃO — ESQUEMA DO BANCO DE DADOS
-- Arquitetura 100% determinística: regras + banco de dados, sem IA externa.
-- Dialeto: PostgreSQL 15+ (tipos e comentários adaptáveis a MySQL/SQLite).
-- Convenções: snake_case; PK = id BIGSERIAL; timestamps UTC; soft delete via
-- deleted_at onde a LGPD exige rastreio (exclusão real ocorre no expurgo).
-- ============================================================================

-- ============================================================================
-- BLOCO 0 — VERSIONAMENTO DE BASES E DIRETRIZES (fundação da auditabilidade)
-- ============================================================================

-- Toda tabela de referência (alimentos, exercícios, faixas de exame, regras)
-- aponta para uma versão de dataset. Mesmo input + mesma versão = mesmo output.
CREATE TABLE dataset_version (
    id              BIGSERIAL PRIMARY KEY,
    dataset_code    TEXT NOT NULL,              -- 'TACO', 'USDA', 'IBGE', 'OFF', 'GUIDELINES', 'EXERCISES', 'LAB_RANGES', 'RULES'
    version_label   TEXT NOT NULL,              -- ex.: 'TACO-4ed-2011', 'ISSN-2017'
    source_url      TEXT,
    published_at    DATE,
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (dataset_code, version_label)
);

-- Diretrizes científicas codificadas (Módulos 4, 7, 15): faixas com fonte.
CREATE TABLE guideline (
    id              BIGSERIAL PRIMARY KEY,
    dataset_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    code            TEXT NOT NULL,              -- 'PROTEIN_G_KG', 'PROTEIN_G_KG_DEFICIT', 'LEUCINE_MG_MEAL', 'FAT_MIN_G_KG', 'WEIGHT_RATE_PCT_WEEK', 'VOLUME_SETS_WEEK', ...
    context         JSONB NOT NULL DEFAULT '{}',-- condições de aplicação: {"goal":"cutting","level":"advanced"}
    min_value       NUMERIC,
    max_value       NUMERIC,
    unit            TEXT NOT NULL,              -- 'g/kg/d', 'mg', 'sets/week', '%/week'
    source_citation TEXT NOT NULL,              -- 'ISSN Position Stand 2017'
    UNIQUE (dataset_version_id, code, context)
);

-- Fórmulas nomeadas do motor de cálculo (Módulos 3 e 14): registro auditável.
CREATE TABLE formula (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,       -- 'MIFFLIN_ST_JEOR', 'KATCH_MCARDLE', 'HARRIS_BENEDICT', 'US_NAVY_BF', 'JACKSON_POLLOCK_3', 'JACKSON_POLLOCK_7', 'EPLEY_1RM', 'BRZYCKI_1RM', 'KARVONEN_HR', 'FFMI', ...
    display_name    TEXT NOT NULL,
    expression      TEXT NOT NULL,              -- expressão simbólica documentada
    inputs          JSONB NOT NULL,             -- ["weight_kg","height_cm","age","sex"]
    error_margin    TEXT,                       -- '±3-5% (dobras cutâneas)'
    source_citation TEXT NOT NULL
);

-- ============================================================================
-- BLOCO 1 — USUÁRIO, PERFIL E LGPD (Módulo 1 + Parte C)
-- ============================================================================

CREATE TABLE app_user (
    id              BIGSERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,              -- argon2id
    mfa_secret      TEXT,                       -- criptografado (chave segregada)
    role            TEXT NOT NULL DEFAULT 'member',  -- 'member','coach','family_admin','system'
    locale          TEXT NOT NULL DEFAULT 'pt-BR',
    theme           TEXT NOT NULL DEFAULT 'system',  -- 'light','dark','system'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ                 -- direito ao esquecimento: marca + job de expurgo real
);

-- Multiusuário (Módulo 16): coach→alunos, família.
CREATE TABLE user_link (
    id              BIGSERIAL PRIMARY KEY,
    owner_user_id   BIGINT NOT NULL REFERENCES app_user(id),
    linked_user_id  BIGINT NOT NULL REFERENCES app_user(id),
    link_type       TEXT NOT NULL,              -- 'coach_athlete','family_member'
    permissions     JSONB NOT NULL DEFAULT '{}',
    UNIQUE (owner_user_id, linked_user_id, link_type)
);

CREATE TABLE profile (
    user_id         BIGINT PRIMARY KEY REFERENCES app_user(id),
    full_name       TEXT NOT NULL,
    sex             TEXT NOT NULL,              -- 'M','F','other'
    birth_date      DATE NOT NULL,
    height_cm       NUMERIC(5,1) NOT NULL,
    primary_goal    TEXT NOT NULL,              -- 'fat_loss','hypertrophy','definition','food_reeducation','performance','strength','running','cycling','crossfit','functional','powerlifting','bodybuilding','health','longevity','rehab'
    activity_level  TEXT NOT NULL,              -- 'sedentary','light','moderate','high','athlete'
    training_place  TEXT,                       -- 'gym','home','outdoor','hybrid'
    budget_level    TEXT,                       -- 'low','medium','high'
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consentimento granular LGPD.
CREATE TABLE consent (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    purpose         TEXT NOT NULL,              -- 'health_data_processing','photos','wearable_sync','lab_import','notifications'
    granted         BOOLEAN NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);

-- Trilha de auditoria (sem PHI no payload — só referências).
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES app_user(id),
    actor_user_id   BIGINT REFERENCES app_user(id),
    action          TEXT NOT NULL,              -- 'plan_generated','data_exported','login','consent_change',...
    entity          TEXT,
    entity_id       BIGINT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, occurred_at);

-- ============================================================================
-- BLOCO 2 — ANAMNESE PROGRESSIVA (Módulo 2: 150+ campos como catálogo EAV
-- tipado — evita tabela com 150 colunas e permite anamnese incremental)
-- ============================================================================

CREATE TABLE questionnaire_field (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,       -- 'has_hypertension','sleep_hours','equipment_available','food_allergies',...
    category        TEXT NOT NULL,              -- 'medical_history','medication','supplement','habit','context'
    question_text   TEXT NOT NULL,
    answer_type     TEXT NOT NULL,              -- 'boolean','number','text','single_choice','multi_choice'
    options         JSONB,                      -- para choice
    validation      JSONB,                      -- {"min":0,"max":24}
    priority        SMALLINT NOT NULL DEFAULT 100, -- ordena a anamnese progressiva: menor = pergunta antes
    triggers_flag   TEXT                        -- código de red flag disparada por certas respostas
);

CREATE TABLE questionnaire_answer (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    field_id        BIGINT NOT NULL REFERENCES questionnaire_field(id),
    value           JSONB NOT NULL,             -- valor tipado validado
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, field_id)                  -- resposta atual; histórico via audit_log
);

-- Lesões e condições estruturadas (usadas como FILTRO pelo gerador de treino).
CREATE TABLE user_condition (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    condition_code  TEXT NOT NULL,              -- 'knee_injury','lumbar_hernia','hypertension','t1_diabetes','pregnancy',...
    severity        TEXT,                       -- 'mild','moderate','severe'
    is_red_flag     BOOLEAN NOT NULL DEFAULT FALSE,
    noted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

-- ============================================================================
-- BLOCO 3 — MEDIDAS E AVALIAÇÃO CORPORAL (Módulos 1, 3, 9)
-- ============================================================================

CREATE TABLE body_measurement (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    measured_at     TIMESTAMPTZ NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual','smart_scale','wearable','vision_estimate'
    weight_kg       NUMERIC(5,2),
    body_fat_pct    NUMERIC(4,1),
    muscle_mass_kg  NUMERIC(5,2),
    bone_mass_kg    NUMERIC(4,2),
    water_pct       NUMERIC(4,1),
    circumferences  JSONB,                      -- {"waist_cm":82,"hip_cm":98,"neck_cm":38,"arm_r_cm":36,...}
    skinfolds       JSONB,                      -- {"tricipital_mm":12,"abdominal_mm":20,...}
    confidence      TEXT NOT NULL DEFAULT 'high'     -- 'high','medium','low' (visão computacional = sempre 'low')
);
CREATE INDEX idx_measure_user_time ON body_measurement(user_id, measured_at);

-- Resultado de cada avaliação do motor determinístico: snapshot auditável
-- com fórmula usada e versão de diretriz — reprodutível para sempre.
CREATE TABLE assessment (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    inputs          JSONB NOT NULL,             -- snapshot dos inputs usados
    bmr_kcal        NUMERIC(6,1) NOT NULL,
    bmr_formula_id  BIGINT NOT NULL REFERENCES formula(id),
    tdee_kcal       NUMERIC(6,1) NOT NULL,
    target_kcal     NUMERIC(6,1) NOT NULL,      -- após déficit/superávit
    bf_pct          NUMERIC(4,1),
    bf_formula_id   BIGINT REFERENCES formula(id),
    lbm_kg          NUMERIC(5,2),
    ffmi            NUMERIC(4,1),
    whr             NUMERIC(4,2),               -- relação cintura-quadril
    ideal_weight_kg NUMERIC(5,2),
    target_weight_kg NUMERIC(5,2),
    macro_protein_g NUMERIC(5,1) NOT NULL,
    macro_carb_g    NUMERIC(5,1) NOT NULL,
    macro_fat_g     NUMERIC(5,1) NOT NULL,
    fiber_g         NUMERIC(4,1),
    water_ml        INTEGER,
    guideline_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    confidence      TEXT NOT NULL,              -- 'high','medium','low'
    notes           TEXT
);

-- ============================================================================
-- BLOCO 4 — BANCO DE ALIMENTOS (Módulo 5, o coração do sistema)
-- ============================================================================

CREATE TABLE food (
    id              BIGSERIAL PRIMARY KEY,
    dataset_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    external_code   TEXT,                       -- código na base de origem (TACO/USDA/OFF)
    barcode         TEXT,                       -- EAN para scanner
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,              -- sem acento/minúsculo, para busca
    category        TEXT NOT NULL,              -- 'cereals','meats','dairy','fruits',...
    ref_portion_g   NUMERIC(6,1) NOT NULL DEFAULT 100,
    kcal            NUMERIC(6,1) NOT NULL,
    protein_g       NUMERIC(5,2) NOT NULL,
    carb_g          NUMERIC(5,2) NOT NULL,
    fat_g           NUMERIC(5,2) NOT NULL,
    fiber_g         NUMERIC(5,2),
    sugar_g         NUMERIC(5,2),
    sat_fat_g       NUMERIC(5,2),
    trans_fat_g     NUMERIC(5,2),
    cholesterol_mg  NUMERIC(6,1),
    sodium_mg       NUMERIC(7,1),
    glycemic_index  NUMERIC(4,1),
    glycemic_load   NUMERIC(4,1),
    micronutrients  JSONB,                      -- {"potassium_mg":..,"magnesium_mg":..,"iron_mg":..,"zinc_mg":..,"vit_a_mcg":..,"vit_b12_mcg":..,"vit_c_mg":..,"vit_d_mcg":..,"vit_e_mg":..,"vit_k_mcg":..,"omega3_g":..,"omega6_g":..}
    amino_acids     JSONB,                      -- {"leucine_mg":..,"lysine_mg":..,...}
    quality_scores  JSONB,                      -- {"pdcaas":..,"diaas":..,"biological_value":..}
    tags            TEXT[] NOT NULL DEFAULT '{}',-- 'vegan','vegetarian','gluten_free','lactose_free','low_fodmap','keto_friendly',...
    avg_price_brl   NUMERIC(8,2)                -- para restrição de orçamento
);
CREATE INDEX idx_food_name ON food USING gin (to_tsvector('portuguese', name_normalized));
CREATE INDEX idx_food_barcode ON food(barcode);
CREATE INDEX idx_food_category ON food(category);
CREATE INDEX idx_food_tags ON food USING gin (tags);

-- Porções caseiras ('1 colher de sopa' = 20 g).
CREATE TABLE food_portion (
    id              BIGSERIAL PRIMARY KEY,
    food_id         BIGINT NOT NULL REFERENCES food(id),
    label           TEXT NOT NULL,              -- 'colher de sopa','unidade média','xícara'
    grams           NUMERIC(6,1) NOT NULL
);

-- Equivalências para substituições inteligentes (Módulo 6): pré-computadas.
CREATE TABLE food_substitution (
    id              BIGSERIAL PRIMARY KEY,
    food_id         BIGINT NOT NULL REFERENCES food(id),
    substitute_food_id BIGINT NOT NULL REFERENCES food(id),
    ratio           NUMERIC(5,2) NOT NULL DEFAULT 1.0,  -- g do substituto por g do original p/ mesmo perfil calórico
    similarity_score NUMERIC(4,3) NOT NULL,     -- 0-1, distância de macros
    UNIQUE (food_id, substitute_food_id)
);

-- ============================================================================
-- BLOCO 5 — PLANO ALIMENTAR (Módulo 6)
-- ============================================================================

CREATE TABLE diet_strategy (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,       -- 'intermittent_fasting','flexible','low_carb','keto','mediterranean','hypercaloric','hypocaloric','bodybuilding','vegan','vegetarian','carnivore','dash','paleo','fodmap','anti_inflammatory'
    display_name    TEXT NOT NULL,
    macro_rules     JSONB NOT NULL,             -- ex.: {"carb_max_pct":10} para keto
    food_tag_filter JSONB NOT NULL DEFAULT '{}',-- tags exigidas/proibidas
    contraindications TEXT[] NOT NULL DEFAULT '{}' -- condition_codes que bloqueiam: keto x 't1_diabetes', jejum x 'pregnancy'...
);

CREATE TABLE meal_plan (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    assessment_id   BIGINT NOT NULL REFERENCES assessment(id),   -- de onde vieram kcal/macros
    strategy_id     BIGINT NOT NULL REFERENCES diet_strategy(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    generator_rules_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    starts_on       DATE NOT NULL,
    ends_on         DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'   -- 'active','archived','superseded'
);

CREATE TABLE planned_meal (
    id              BIGSERIAL PRIMARY KEY,
    meal_plan_id    BIGINT NOT NULL REFERENCES meal_plan(id),
    day_of_week     SMALLINT NOT NULL,          -- 0-6
    meal_slot       TEXT NOT NULL,              -- 'breakfast','morning_snack','lunch','afternoon_snack','dinner','supper','pre_workout','post_workout'
    scheduled_time  TIME,
    target_kcal     NUMERIC(6,1) NOT NULL,
    target_protein_g NUMERIC(5,1) NOT NULL
);

CREATE TABLE planned_meal_item (
    id              BIGSERIAL PRIMARY KEY,
    planned_meal_id BIGINT NOT NULL REFERENCES planned_meal(id),
    food_id         BIGINT NOT NULL REFERENCES food(id),
    quantity_g      NUMERIC(6,1) NOT NULL
);

-- Diário alimentar real (tracking; alimenta dashboard e motor de ajuste).
CREATE TABLE food_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    eaten_at        TIMESTAMPTZ NOT NULL,
    food_id         BIGINT NOT NULL REFERENCES food(id),
    quantity_g      NUMERIC(6,1) NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual','barcode','photo_scan','voice'
    planned_meal_id BIGINT REFERENCES planned_meal(id)
);
CREATE INDEX idx_foodlog_user_time ON food_log(user_id, eaten_at);

CREATE TABLE shopping_list (
    id              BIGSERIAL PRIMARY KEY,
    meal_plan_id    BIGINT NOT NULL REFERENCES meal_plan(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shopping_list_item (
    id              BIGSERIAL PRIMARY KEY,
    shopping_list_id BIGINT NOT NULL REFERENCES shopping_list(id),
    food_id         BIGINT NOT NULL REFERENCES food(id),
    total_g         NUMERIC(8,1) NOT NULL,
    est_price_brl   NUMERIC(8,2),
    purchased       BOOLEAN NOT NULL DEFAULT FALSE
);

-- Receitas (composição de alimentos com rendimento).
CREATE TABLE recipe (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    instructions    TEXT NOT NULL,
    servings        NUMERIC(4,1) NOT NULL,
    tags            TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE recipe_ingredient (
    recipe_id       BIGINT NOT NULL REFERENCES recipe(id),
    food_id         BIGINT NOT NULL REFERENCES food(id),
    quantity_g      NUMERIC(6,1) NOT NULL,
    PRIMARY KEY (recipe_id, food_id)
);

-- ============================================================================
-- BLOCO 6 — BANCO DE EXERCÍCIOS E TREINO (Módulo 7)
-- ============================================================================

CREATE TABLE exercise (
    id              BIGSERIAL PRIMARY KEY,
    dataset_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    code            TEXT NOT NULL UNIQUE,       -- 'BB_BACK_SQUAT','DB_BENCH_PRESS',...
    name            TEXT NOT NULL,
    primary_muscle  TEXT NOT NULL,              -- 'quadriceps','chest','lats','glutes',...
    secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
    movement_pattern TEXT NOT NULL,             -- 'squat','hinge','push_h','push_v','pull_h','pull_v','lunge','carry','core','cardio'
    equipment       TEXT[] NOT NULL,            -- 'barbell','dumbbell','machine','cable','bodyweight','kettlebell','band'
    difficulty      TEXT NOT NULL,              -- 'beginner','intermediate','advanced'
    is_compound     BOOLEAN NOT NULL,
    contraindicated_conditions TEXT[] NOT NULL DEFAULT '{}', -- condition_codes que EXCLUEM o exercício no filtro
    video_url       TEXT,
    cues            TEXT                        -- dicas de execução
);
CREATE INDEX idx_exercise_muscle ON exercise(primary_muscle);
CREATE INDEX idx_exercise_equipment ON exercise USING gin (equipment);

CREATE TABLE workout_plan (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    generator_rules_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    goal            TEXT NOT NULL,
    split_type      TEXT NOT NULL,              -- 'full_body','upper_lower','ppl','abcde',...
    days_per_week   SMALLINT NOT NULL,
    mesocycle_week  SMALLINT NOT NULL DEFAULT 1,
    is_deload       BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE workout_session_template (
    id              BIGSERIAL PRIMARY KEY,
    workout_plan_id BIGINT NOT NULL REFERENCES workout_plan(id),
    day_label       TEXT NOT NULL,              -- 'A','B','Push','Legs'...
    day_of_week     SMALLINT,
    warmup_notes    TEXT,
    mobility_notes  TEXT
);

CREATE TABLE workout_exercise (
    id              BIGSERIAL PRIMARY KEY,
    session_template_id BIGINT NOT NULL REFERENCES workout_session_template(id),
    exercise_id     BIGINT NOT NULL REFERENCES exercise(id),
    seq             SMALLINT NOT NULL,
    sets            SMALLINT NOT NULL,
    rep_min         SMALLINT NOT NULL,
    rep_max         SMALLINT NOT NULL,
    tempo           TEXT,                       -- '3-1-1-0'
    suggested_load_kg NUMERIC(6,1),
    target_rpe      NUMERIC(3,1),
    target_rir      SMALLINT,
    rest_seconds    SMALLINT NOT NULL,
    technique       TEXT                        -- NULL ou 'drop_set','rest_pause','bi_set','tri_set','fst7','superset','cluster','pyramid'
);

-- Execução real (tracking de treino; alimenta progressão automática).
CREATE TABLE workout_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    session_template_id BIGINT REFERENCES workout_session_template(id),
    performed_at    TIMESTAMPTZ NOT NULL,
    duration_min    SMALLINT,
    perceived_effort NUMERIC(3,1)               -- RPE da sessão
);

CREATE TABLE set_log (
    id              BIGSERIAL PRIMARY KEY,
    workout_log_id  BIGINT NOT NULL REFERENCES workout_log(id),
    exercise_id     BIGINT NOT NULL REFERENCES exercise(id),
    set_number      SMALLINT NOT NULL,
    reps            SMALLINT NOT NULL,
    load_kg         NUMERIC(6,1) NOT NULL,
    rpe             NUMERIC(3,1),
    rir             SMALLINT,
    rep_source      TEXT NOT NULL DEFAULT 'manual'  -- 'manual','camera_count' (baixa confiança)
);
CREATE INDEX idx_setlog_user_ex ON set_log(exercise_id, workout_log_id);

-- ============================================================================
-- BLOCO 7 — EXAMES LABORATORIAIS (Módulo 8, educativo)
-- ============================================================================

CREATE TABLE lab_marker (
    id              BIGSERIAL PRIMARY KEY,
    dataset_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    code            TEXT NOT NULL,              -- 'VIT_D','B12','FERRITIN','TSH','T3','T4','TESTOSTERONE','ESTRADIOL','CORTISOL','INSULIN','GLUCOSE','HBA1C','LDL','HDL','TRIGLYCERIDES','CRP','CREATININE','UREA','AST','ALT','MAGNESIUM','ZINC','SODIUM','POTASSIUM','HEMOGLOBIN',...
    display_name    TEXT NOT NULL,
    unit            TEXT NOT NULL,
    UNIQUE (dataset_version_id, code)
);

-- Faixas de referência segmentadas por sexo/idade, com faixa crítica (red flag).
CREATE TABLE lab_reference_range (
    id              BIGSERIAL PRIMARY KEY,
    marker_id       BIGINT NOT NULL REFERENCES lab_marker(id),
    sex             TEXT,                       -- NULL = ambos
    age_min         SMALLINT,
    age_max         SMALLINT,
    normal_min      NUMERIC(10,3),
    normal_max      NUMERIC(10,3),
    critical_min    NUMERIC(10,3),              -- abaixo disto → red flag
    critical_max    NUMERIC(10,3),              -- acima disto → red flag
    source_citation TEXT NOT NULL
);

CREATE TABLE lab_result (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    marker_id       BIGINT NOT NULL REFERENCES lab_marker(id),
    value           NUMERIC(10,3) NOT NULL,
    collected_on    DATE NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual','pdf_import','ocr'
    interpretation  TEXT,                       -- 'below_range','in_range','above_range','critical' (calculado por regra)
    educational_note_id BIGINT                  -- FK para banco de mensagens educativas
);
CREATE INDEX idx_labresult_user ON lab_result(user_id, collected_on);

-- ============================================================================
-- BLOCO 8 — HÁBITOS, GAMIFICAÇÃO E COACH (Módulos 10, 12)
-- ============================================================================

-- Registro diário unificado de hábitos (uma linha por usuário/dia/métrica).
CREATE TABLE habit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    log_date        DATE NOT NULL,
    metric          TEXT NOT NULL,              -- 'sleep_hours','water_ml','steps','mood','energy','motivation','stress','caffeine_mg','alcohol_doses','cigarettes','meditation_min','breathing_min','stretching_min'
    value           NUMERIC(10,2) NOT NULL,
    source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual','wearable'
    UNIQUE (user_id, log_date, metric, source)
);
CREATE INDEX idx_habit_user_date ON habit_log(user_id, log_date);

CREATE TABLE challenge (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    rule            JSONB NOT NULL,             -- {"metric":"water_ml","target":2500,"days":7}
    xp_reward       INTEGER NOT NULL
);

CREATE TABLE user_challenge (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    challenge_id    BIGINT NOT NULL REFERENCES challenge(id),
    started_on      DATE NOT NULL,
    completed_on    DATE,
    status          TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE achievement (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    unlock_rule     JSONB NOT NULL,             -- {"event":"workout_count","threshold":100}
    xp_reward       INTEGER NOT NULL
);

CREATE TABLE user_gamification (
    user_id         BIGINT PRIMARY KEY REFERENCES app_user(id),
    xp_total        INTEGER NOT NULL DEFAULT 0,
    level           SMALLINT NOT NULL DEFAULT 1,
    current_streak  INTEGER NOT NULL DEFAULT 0,
    longest_streak  INTEGER NOT NULL DEFAULT 0,
    achievements    BIGINT[] NOT NULL DEFAULT '{}'  -- ids de achievement desbloqueados
);

-- Banco de mensagens do coach por regras (Módulo 12): selecionadas, não geradas.
CREATE TABLE coach_message (
    id              BIGSERIAL PRIMARY KEY,
    category        TEXT NOT NULL,              -- 'reminder','motivation','alert','goal','feedback','correction','educational_lab_note','chat_answer'
    trigger_rule    JSONB NOT NULL,             -- condição de estado: {"metric":"water_ml","below_target_days":2}
    level           TEXT NOT NULL DEFAULT 'all',-- 'beginner','intermediate','advanced','all' (3 níveis de explicação)
    body            TEXT NOT NULL,
    locale          TEXT NOT NULL DEFAULT 'pt-BR'
);

CREATE TABLE coach_message_sent (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    message_id      BIGINT NOT NULL REFERENCES coach_message(id),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel         TEXT NOT NULL               -- 'push','in_app','email'
);

-- ============================================================================
-- BLOCO 9 — MOTOR DE REGRAS E ADAPTAÇÃO (Módulo 15)
-- ============================================================================

-- Regras de adaptação versionadas: platô, ajuste de kcal, progressão de carga.
CREATE TABLE adaptation_rule (
    id              BIGSERIAL PRIMARY KEY,
    dataset_version_id BIGINT NOT NULL REFERENCES dataset_version(id),
    code            TEXT NOT NULL,              -- 'PLATEAU_WEIGHT_14D','PROGRESS_LOAD_2X_TOP_REPS','DELOAD_EVERY_5W','KCAL_ADJUST_STEP',...
    condition       JSONB NOT NULL,             -- {"trend_metric":"weight_kg","window_days":14,"max_change_pct":0.3}
    action          JSONB NOT NULL,             -- {"adjust":"target_kcal","delta_pct":-5}
    explanation_beginner     TEXT NOT NULL,     -- 3 níveis de explicação
    explanation_intermediate TEXT NOT NULL,
    explanation_advanced     TEXT NOT NULL,
    source_citation TEXT NOT NULL,
    UNIQUE (dataset_version_id, code)
);

-- Toda decisão automática registrada: o que disparou, o que mudou, por quê.
CREATE TABLE adaptation_event (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    rule_id         BIGINT NOT NULL REFERENCES adaptation_rule(id),
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    evidence        JSONB NOT NULL,             -- dados de tendência que dispararam
    action_taken    JSONB NOT NULL,             -- mudança aplicada (novo kcal, nova carga...)
    superseded_assessment_id BIGINT REFERENCES assessment(id),
    new_assessment_id        BIGINT REFERENCES assessment(id)
);

-- Red flags disparadas (Parte B): pausa recomendação + orienta profissional.
CREATE TABLE red_flag_event (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    flag_code       TEXT NOT NULL,              -- 'CHEST_PAIN','BMI_LT_175_CUTTING','ED_INDICATORS','PREGNANCY','CRITICAL_LAB','MINOR_NO_GUARDIAN',...
    source          TEXT NOT NULL,              -- 'questionnaire','lab_result','measurement','manual'
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    blocks_generation BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- BLOCO 10 — METAS, FOTOS, INTEGRAÇÕES E CACHE (Módulos 9, 11, 16)
-- ============================================================================

CREATE TABLE goal (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    metric          TEXT NOT NULL,              -- 'weight_kg','body_fat_pct','squat_1rm','steps','water_ml'
    target_value    NUMERIC(10,2) NOT NULL,
    start_value     NUMERIC(10,2) NOT NULL,
    starts_on       DATE NOT NULL,
    estimated_eta   DATE,                       -- calculada por tendência, com incerteza
    eta_range_days  SMALLINT,                   -- ± faixa de incerteza
    achieved_on     DATE,
    status          TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE progress_photo (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    taken_at        TIMESTAMPTZ NOT NULL,
    pose            TEXT NOT NULL,              -- 'front','side','back'
    storage_key     TEXT NOT NULL,              -- objeto criptografado; nunca URL pública
    vision_estimate JSONB,                      -- {"bf_pct_est":18.5,"posture_notes":[...],"confidence":"low"}  sempre baixa confiança
    consent_id      BIGINT NOT NULL REFERENCES consent(id)
);

CREATE TABLE device_integration (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    provider        TEXT NOT NULL,              -- 'apple_health','google_fit','garmin','whoop','smart_scale','other'
    external_id     TEXT,
    auth_token_enc  TEXT,                       -- criptografado, chave segregada
    last_sync_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active',
    UNIQUE (user_id, provider)
);

-- Cache de cálculos determinísticos: chave = hash(inputs + versões).
-- Mesmo input + mesmas versões → hit garantido (propriedade do sistema).
CREATE TABLE calc_cache (
    cache_key       TEXT PRIMARY KEY,           -- sha256(formula_code + inputs_json + dataset_versions)
    result          JSONB NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notificações agendadas (fila; PHI nunca no corpo — só referência).
CREATE TABLE notification_queue (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    coach_message_id BIGINT REFERENCES coach_message(id),
    scheduled_for   TIMESTAMPTZ NOT NULL,
    channel         TEXT NOT NULL,
    sent_at         TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'pending'
);

-- ============================================================================
-- RELACIONAMENTOS-CHAVE (resumo)
-- ============================================================================
-- app_user 1—1 profile, user_gamification
-- app_user 1—N questionnaire_answer, user_condition, body_measurement,
--              assessment, meal_plan, workout_plan, food_log, workout_log,
--              lab_result, habit_log, goal, progress_photo, red_flag_event
-- assessment N—1 formula (TMB e %gordura) e N—1 dataset_version (diretrizes)
-- meal_plan N—1 assessment (rastreia a origem dos números) e diet_strategy
-- meal_plan 1—N planned_meal 1—N planned_meal_item N—1 food
-- workout_plan 1—N workout_session_template 1—N workout_exercise N—1 exercise
-- workout_log 1—N set_log (real x planejado permite progressão automática)
-- lab_result N—1 lab_marker 1—N lab_reference_range (interpretação por faixa)
-- adaptation_event N—1 adaptation_rule (toda mudança automática tem regra-mãe)
-- Tudo que é referência aponta para dataset_version → auditabilidade total.

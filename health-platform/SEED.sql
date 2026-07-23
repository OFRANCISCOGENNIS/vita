-- ============================================================================
-- SEED INICIAL — dados de referência que transformam o esquema em sistema.
-- Tudo com fonte e versão. Complementa DB_SCHEMA.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Versões de dataset
-- ---------------------------------------------------------------------------
INSERT INTO dataset_version (dataset_code, version_label, source_url, published_at) VALUES
('GUIDELINES', 'ISSN-2017+ACSM-2021', 'https://jissn.biomedcentral.com', '2021-06-01'),  -- id 1
('LAB_RANGES', 'SBPC-2023',           NULL,                              '2023-01-01'),  -- id 2
('RULES',      'ADAPT-v1',            NULL,                              '2026-01-01'),  -- id 3
('TACO',       'TACO-4ed-2011',       'http://www.nepa.unicamp.br/taco', '2011-01-01'),  -- id 4
('EXERCISES',  'EXDB-v1',             NULL,                              '2026-01-01');  -- id 5

-- ---------------------------------------------------------------------------
-- Fórmulas nomeadas (Módulos 3 e 14)
-- ---------------------------------------------------------------------------
INSERT INTO formula (code, display_name, expression, inputs, error_margin, source_citation) VALUES
('MIFFLIN_ST_JEOR',   'Mifflin-St Jeor (TMB)',    '10*peso + 6.25*altura - 5*idade + (sexo=M ? 5 : -161)', '["weight_kg","height_cm","age","sex"]', '±10%', 'Mifflin et al., Am J Clin Nutr 1990'),
('KATCH_MCARDLE',     'Katch-McArdle (TMB)',      '370 + 21.6 * LBM_kg', '["lbm_kg"]', '±5% com %gordura confiável', 'Katch & McArdle 1996'),
('HARRIS_BENEDICT',   'Harris-Benedict rev. (TMB)','M: 88.362+13.397p+4.799a-5.677i | F: 447.593+9.247p+3.098a-4.330i', '["weight_kg","height_cm","age","sex"]', '±14%', 'Roza & Shizgal 1984'),
('US_NAVY_BF',        'US Navy (%gordura)',       'M: 495/(1.0324-0.19077*log10(cintura-pescoco)+0.15456*log10(altura))-450', '["waist_cm","neck_cm","hip_cm","height_cm","sex"]', '±3-4%', 'Hodgdon & Beckett 1984'),
('JACKSON_POLLOCK_3', 'Jackson-Pollock 3 dobras', 'densidade corporal por polinômio da soma de 3 dobras + Siri', '["skinfolds_mm","age","sex"]', '±3-5%', 'Jackson & Pollock 1978/1980'),
('FFMI',              'Fat-Free Mass Index',      'LBM_kg / altura_m^2 (+ 6.1*(1.8-altura_m) normalizado)', '["lbm_kg","height_m"]', '—', 'Kouri et al. 1995'),
('EPLEY_1RM',         'Epley (1RM estimado)',     'carga * (1 + reps/30)', '["load_kg","reps"]', '±5% até 10 reps', 'Epley 1985'),
('BRZYCKI_1RM',       'Brzycki (1RM estimado)',   'carga * 36/(37-reps)', '["load_kg","reps"]', '±5% até 10 reps', 'Brzycki 1993'),
('FOX_HRMAX',         'FCmáx (Fox)',              '220 - idade', '["age"]', '±10-12 bpm', 'Fox et al. 1971'),
('TANAKA_HRMAX',      'FCmáx (Tanaka)',           '208 - 0.7*idade', '["age"]', '±7-10 bpm', 'Tanaka et al. 2001'),
('KARVONEN_HR',       'Karvonen (zonas FC)',      'FCrepouso + intensidade*(FCmáx-FCrepouso)', '["hr_rest","hr_max","intensity"]', '—', 'Karvonen 1957'),
('WATER_ML_KG',       'Água diária',              '35 ml/kg (ajuste +500-1000ml por hora de treino)', '["weight_kg","training_min"]', 'faixa', 'EFSA 2010');

-- ---------------------------------------------------------------------------
-- Diretrizes (Módulo 4/7) — faixas com fonte, condicionadas por contexto
-- ---------------------------------------------------------------------------
INSERT INTO guideline (dataset_version_id, code, context, min_value, max_value, unit, source_citation) VALUES
(1, 'PROTEIN_G_KG',          '{}',                       1.4, 2.0,  'g/kg/d',    'ISSN Position Stand: Protein, 2017'),
(1, 'PROTEIN_G_KG_DEFICIT',  '{"goal":"fat_loss"}',      2.3, 3.1,  'g/kg LBM/d','Helms et al. 2014'),
(1, 'PROTEIN_G_MEAL',        '{}',                       20,  40,   'g',         'Schoenfeld & Aragon 2018'),
(1, 'LEUCINE_MG_MEAL',       '{}',                       700, 3000, 'mg',        'ISSN 2017'),
(1, 'MEAL_INTERVAL_H',       '{}',                       3,   4,    'h',         'ISSN 2017'),
(1, 'FAT_MIN_G_KG',          '{}',                       0.6, 0.8,  'g/kg/d',    'ISSN 2017'),
(1, 'WEIGHT_LOSS_PCT_WEEK',  '{"goal":"fat_loss"}',      0.25,1.0,  '%/week',    'Garthe et al. 2011'),
(1, 'WEIGHT_GAIN_PCT_WEEK',  '{"goal":"hypertrophy"}',   0.25,0.5,  '%/week',    'Iraki et al. 2019'),
(1, 'DEFICIT_PCT',           '{"goal":"fat_loss"}',      15,  25,   '%TDEE',     'Helms et al. 2014'),
(1, 'SURPLUS_PCT',           '{"goal":"hypertrophy"}',   5,   15,   '%TDEE',     'Iraki et al. 2019'),
(1, 'VOLUME_SETS_WEEK',      '{}',                       10,  20,   'sets/week', 'Schoenfeld et al. 2017'),
(1, 'VOLUME_SETS_WEEK',      '{"level":"beginner"}',     8,   12,   'sets/week', 'Schoenfeld et al. 2017'),
(1, 'HYPERTROPHY_REPS',      '{"goal":"hypertrophy"}',   6,   12,   'reps',      'ACSM 2009'),
(1, 'STRENGTH_REPS',         '{"goal":"strength"}',      1,   6,    'reps',      'ACSM 2009'),
(1, 'REST_COMPOUND_S',       '{}',                       120, 180,  's',         'de Salles et al. 2009'),
(1, 'REST_ISOLATION_S',      '{}',                       60,  90,   's',         'de Salles et al. 2009'),
(1, 'FIBER_G_1000KCAL',      '{}',                       14,  14,   'g/1000kcal','IOM/DRI 2005'),
(1, 'DELOAD_EVERY_WEEKS',    '{}',                       4,   6,    'weeks',     'Prática baseada em evidência (periodização)');

-- ---------------------------------------------------------------------------
-- Estratégias de dieta com contraindicações codificadas (Módulo 6)
-- ---------------------------------------------------------------------------
INSERT INTO diet_strategy (code, display_name, macro_rules, food_tag_filter, contraindications) VALUES
('flexible',        'Dieta flexível',      '{}', '{}', '{}'),
('low_carb',        'Low carb',            '{"carb_max_pct":25}', '{}', '{"t1_diabetes","pregnancy"}'),
('keto',            'Cetogênica',          '{"carb_max_g":50,"fat_min_pct":60}', '{"require":["keto_friendly"]}', '{"t1_diabetes","pregnancy","liver_disease","kidney_disease"}'),
('mediterranean',   'Mediterrânea',        '{"fat_profile":"unsaturated"}', '{}', '{}'),
('intermittent_fasting','Jejum intermitente','{"eating_window_h":8}', '{}', '{"t1_diabetes","pregnancy","eating_disorder_history","under_18"}'),
('vegan',           'Vegana',              '{}', '{"require":["vegan"]}', '{}'),
('vegetarian',      'Vegetariana',         '{}', '{"require":["vegetarian"]}', '{}'),
('dash',            'DASH',                '{"sodium_max_mg":2300}', '{}', '{}'),
('paleo',           'Paleo',               '{}', '{"exclude":["processed","grains","dairy"]}', '{}'),
('fodmap',          'Low FODMAP',          '{}', '{"require":["low_fodmap"]}', '{}'),
('anti_inflammatory','Anti-inflamatória',  '{}', '{"exclude":["ultra_processed"]}', '{}'),
('hypercaloric',    'Hipercalórica',       '{"kcal_mode":"surplus"}', '{}', '{}'),
('hypocaloric',     'Hipocalórica',        '{"kcal_mode":"deficit"}', '{}', '{"bmi_lt_175","eating_disorder_history"}'),
('carnivore',       'Carnívora',           '{}', '{"require":["animal_based"]}', '{"kidney_disease","cardiovascular_disease"}'),
('bodybuilding',    'Bodybuilding',        '{"protein_priority":true,"meals_min":5}', '{}', '{}');

-- ---------------------------------------------------------------------------
-- Marcadores laboratoriais + faixas (Módulo 8) — exemplos representativos
-- ---------------------------------------------------------------------------
INSERT INTO lab_marker (dataset_version_id, code, display_name, unit) VALUES
(2, 'VIT_D',       '25-OH Vitamina D',      'ng/mL'),   -- id 1
(2, 'B12',         'Vitamina B12',          'pg/mL'),   -- id 2
(2, 'FERRITIN',    'Ferritina',             'ng/mL'),   -- id 3
(2, 'TSH',         'TSH',                   'µUI/mL'),  -- id 4
(2, 'GLUCOSE',     'Glicemia de jejum',     'mg/dL'),   -- id 5
(2, 'HBA1C',       'Hemoglobina glicada',   '%'),       -- id 6
(2, 'LDL',         'LDL colesterol',        'mg/dL'),   -- id 7
(2, 'HDL',         'HDL colesterol',        'mg/dL'),   -- id 8
(2, 'TRIGLYCERIDES','Triglicerídeos',       'mg/dL'),   -- id 9
(2, 'CREATININE',  'Creatinina',            'mg/dL'),   -- id 10
(2, 'ALT',         'TGP/ALT',               'U/L'),     -- id 11
(2, 'CRP',         'PCR ultrassensível',    'mg/L');    -- id 12

INSERT INTO lab_reference_range (marker_id, sex, age_min, age_max, normal_min, normal_max, critical_min, critical_max, source_citation) VALUES
(1,  NULL, NULL, NULL, 30,   100,  10,   150,  'Endocrine Society 2011'),
(2,  NULL, NULL, NULL, 200,  900,  100,  NULL, 'SBPC 2023'),
(3,  'M',  NULL, NULL, 30,   400,  10,   1000, 'SBPC 2023'),
(3,  'F',  NULL, NULL, 15,   150,  8,    1000, 'SBPC 2023'),
(4,  NULL, NULL, NULL, 0.4,  4.5,  0.1,  10,   'SBPC 2023'),
(5,  NULL, NULL, NULL, 70,   99,   50,   200,  'ADA 2023 (educativo)'),
(6,  NULL, NULL, NULL, 4.0,  5.6,  NULL, 9.0,  'ADA 2023 (educativo)'),
(7,  NULL, NULL, NULL, NULL, 130,  NULL, 190,  'SBC 2019 (educativo)'),
(8,  'M',  NULL, NULL, 40,   NULL, 20,   NULL, 'SBC 2019'),
(8,  'F',  NULL, NULL, 50,   NULL, 20,   NULL, 'SBC 2019'),
(9,  NULL, NULL, NULL, NULL, 150,  NULL, 500,  'SBC 2019'),
(10, 'M',  NULL, NULL, 0.7,  1.3,  NULL, 4.0,  'SBPC 2023'),
(10, 'F',  NULL, NULL, 0.6,  1.1,  NULL, 4.0,  'SBPC 2023'),
(11, NULL, NULL, NULL, 7,    56,   NULL, 300,  'SBPC 2023'),
(12, NULL, NULL, NULL, NULL, 3.0,  NULL, 10,   'AHA/CDC 2003');

-- ---------------------------------------------------------------------------
-- Regras de adaptação (Módulo 15) — condição/ação + explicação em 3 níveis
-- ---------------------------------------------------------------------------
INSERT INTO adaptation_rule (dataset_version_id, code, condition, action, explanation_beginner, explanation_intermediate, explanation_advanced, source_citation) VALUES
(3, 'PLATEAU_WEIGHT_14D',
 '{"trend_metric":"weight_kg","window_days":14,"min_datapoints":8,"max_abs_change_pct":0.3,"requires_goal":"fat_loss","requires_adherence_pct":80}',
 '{"adjust":"target_kcal","delta_pct":-5,"floor_bmr_multiple":1.1,"also_suggest":"add_2000_steps"}',
 'Seu peso ficou parado por 2 semanas mesmo seguindo o plano, então vamos reduzir um pouco as calorias para o corpo voltar a responder.',
 'Média móvel de 14 dias variou <0,3% com adesão ≥80%: reduzimos 5% das calorias-alvo (nunca abaixo de 1,1×TMB) e sugerimos +2000 passos/dia.',
 'Platô definido por tendência (não ponto): regressão sobre 14d com ≥8 medições. Ação: -5% kcal com piso de 1,1×TMB para mitigar adaptação metabólica; preferimos aumentar NEAT antes de novo corte.',
 'Trexler et al. 2014 (adaptação metabólica)'),
(3, 'PROGRESS_LOAD_TOP_REPS_2X',
 '{"event":"exercise_sets","condition":"all_sets_at_rep_max_with_rir_ge_1","consecutive_sessions":2}',
 '{"adjust":"suggested_load_kg","delta_pct_compound":2.5,"delta_pct_isolation":5.0}',
 'Você completou todas as repetições com folga duas vezes seguidas — hora de aumentar o peso.',
 'Topo da faixa de reps atingido com RIR≥1 em 2 sessões consecutivas: +2,5% em compostos, +5% em isolados.',
 'Progressão dupla clássica: fixa faixa de reps, progride carga ao dominar o topo da faixa com reserva. Incrementos menores em compostos pela maior carga absoluta.',
 'Sobrecarga progressiva — ACSM 2009'),
(3, 'DELOAD_EVERY_5W',
 '{"weeks_since_deload":5,"or_condition":{"metric":"session_rpe_avg","window_sessions":6,"gte":9}}',
 '{"action":"insert_deload_week","volume_pct":50,"intensity_pct":80}',
 'Depois de semanas treinando pesado, uma semana mais leve ajuda o corpo a se recuperar e voltar mais forte.',
 'A cada 5 semanas (ou RPE médio ≥9 em 6 sessões): semana com 50% do volume e 80% da carga.',
 'Deload proativo por tempo ou reativo por RPE acumulado; mantém intensidade relativa suficiente para não destreinar enquanto dissipa fadiga.',
 'Periodização — Helms, Israetel'),
(3, 'ADHERENCE_LOW_SIMPLIFY',
 '{"metric":"meal_plan_adherence_pct","window_days":14,"lt":60}',
 '{"action":"simplify_plan","meals_reduce_to":4,"flexible_slots":1}',
 'Percebemos que está difícil seguir o plano — vamos simplificar para facilitar o dia a dia.',
 'Adesão <60% em 14 dias: plano simplificado para 4 refeições com 1 slot livre.',
 'Adesão supera otimização teórica: plano 80% ótimo seguido a 90% vence plano 100% ótimo seguido a 50%. Redução de fricção antes de qualquer ajuste calórico.',
 'Comportamental — adesão como preditor primário'),
(3, 'RAPID_LOSS_BRAKE',
 '{"trend_metric":"weight_kg","window_days":14,"loss_pct_week_gt":1.5}',
 '{"adjust":"target_kcal","delta_pct":10,"flag":"review_red_flags"}',
 'Você está perdendo peso rápido demais, o que pode custar massa muscular — vamos aumentar um pouco as calorias.',
 'Perda >1,5%/semana sustentada: +10% kcal e revisão de red flags (preserva massa magra).',
 'Taxas >1%/sem elevam proporção de perda de LBM (Garthe 2011). Freio automático + checagem de transtorno alimentar nos guardrails.',
 'Garthe et al. 2011');

-- ---------------------------------------------------------------------------
-- Mensagens do coach por regras (Módulo 12) — amostra
-- ---------------------------------------------------------------------------
INSERT INTO coach_message (category, trigger_rule, level, body, locale) VALUES
('reminder',   '{"metric":"water_ml","pct_of_target_by_18h_lt":50}', 'all', 'Você bebeu menos da metade da sua meta de água até agora. Uma garrafa de 500 ml agora te coloca de volta no ritmo. 💧', 'pt-BR'),
('motivation', '{"event":"streak_milestone","value":7}',            'all', '7 dias seguidos! Consistência é o que separa quem tenta de quem consegue. 🔥', 'pt-BR'),
('alert',      '{"metric":"sleep_hours","avg_7d_lt":6}',            'all', 'Sua média de sono está abaixo de 6h. Sono curto atrapalha recuperação e controle do apetite — que tal antecipar 30 min hoje?', 'pt-BR'),
('feedback',   '{"event":"workout_completed","all_sets_done":true}','all', 'Treino completo, todas as séries feitas. Registro salvo — a progressão de carga é calculada automaticamente. ✅', 'pt-BR'),
('educational_lab_note', '{"lab":"VIT_D","interpretation":"below_range"}', 'all', 'Sua vitamina D está abaixo da faixa de referência. Isso é comum e tem solução simples — leve este resultado a um médico ou nutricionista para orientação. (Não fazemos sugestão de dose.)', 'pt-BR');

-- ---------------------------------------------------------------------------
-- Amostra de alimentos (TACO, por 100 g) — base mínima para testes
-- ---------------------------------------------------------------------------
INSERT INTO food (dataset_version_id, external_code, name, name_normalized, category, kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg, glycemic_index, tags, amino_acids) VALUES
(4, 'TACO-0064', 'Arroz, integral, cozido',        'arroz integral cozido',        'cereals', 124, 2.6, 25.8, 1.0, 2.7, 1,   50, '{vegan,vegetarian,gluten_free}', '{"leucine_mg":215}'),
(4, 'TACO-0100', 'Feijão, carioca, cozido',        'feijao carioca cozido',        'legumes', 76,  4.8, 13.6, 0.5, 8.5, 2,   30, '{vegan,vegetarian,gluten_free}', '{"leucine_mg":380}'),
(4, 'TACO-1109', 'Frango, peito, sem pele, grelhado','frango peito sem pele grelhado','meats',  159, 32.0, 0.0, 2.5, 0.0, 51, NULL,'{gluten_free,lactose_free,animal_based,keto_friendly}', '{"leucine_mg":2650}'),
(4, 'TACO-1300', 'Ovo, de galinha, inteiro, cozido','ovo de galinha inteiro cozido','eggs',    146, 13.3, 0.6, 9.5, 0.0, 146,NULL,'{vegetarian,gluten_free,lactose_free,animal_based,keto_friendly}', '{"leucine_mg":1090}'),
(4, 'TACO-0225', 'Batata, doce, cozida',           'batata doce cozida',           'tubers',  77,  0.6, 18.4, 0.1, 2.2, 27,  63, '{vegan,vegetarian,gluten_free}', '{"leucine_mg":30}'),
(4, 'TACO-0433', 'Banana, prata',                  'banana prata',                 'fruits',  98,  1.3, 26.0, 0.1, 2.0, 0,   52, '{vegan,vegetarian,gluten_free}', '{"leucine_mg":70}'),
(4, 'TACO-1002', 'Tilápia, filé, grelhado',        'tilapia file grelhado',        'fish',    96,  20.1, 0.0, 1.7, 0.0, 56, NULL,'{gluten_free,lactose_free,animal_based,keto_friendly}', '{"leucine_mg":1580}'),
(4, 'TACO-0577', 'Azeite, de oliva, extra virgem', 'azeite de oliva extra virgem', 'oils',    884, 0.0, 0.0, 100.0,0.0, 0,  NULL,'{vegan,vegetarian,gluten_free,keto_friendly}', '{}'),
(4, 'TACO-0813', 'Aveia, flocos',                  'aveia flocos',                 'cereals', 394, 13.9,66.6, 8.5, 9.1, 5,   55, '{vegan,vegetarian}', '{"leucine_mg":1010}'),
(4, 'TACO-0790', 'Queijo, minas, frescal',         'queijo minas frescal',         'dairy',   264, 17.4, 3.2,20.2, 0.0, 31, NULL,'{vegetarian,gluten_free,keto_friendly}', '{"leucine_mg":1700}');

-- ---------------------------------------------------------------------------
-- Amostra de exercícios — base mínima para o gerador filtrar
-- ---------------------------------------------------------------------------
INSERT INTO exercise (dataset_version_id, code, name, primary_muscle, secondary_muscles, movement_pattern, equipment, difficulty, is_compound, contraindicated_conditions) VALUES
(5, 'BB_BACK_SQUAT',    'Agachamento livre',        'quadriceps', '{glutes,core}',      'squat',   '{barbell}',    'intermediate', TRUE,  '{knee_injury,lumbar_hernia}'),
(5, 'LEG_PRESS',        'Leg press 45°',            'quadriceps', '{glutes}',           'squat',   '{machine}',    'beginner',     TRUE,  '{knee_injury}'),
(5, 'GOBLET_SQUAT',     'Agachamento goblet',       'quadriceps', '{glutes,core}',      'squat',   '{dumbbell,kettlebell}', 'beginner', TRUE, '{knee_injury}'),
(5, 'BB_DEADLIFT',      'Levantamento terra',       'hamstrings', '{glutes,back,core}', 'hinge',   '{barbell}',    'advanced',     TRUE,  '{lumbar_hernia}'),
(5, 'DB_RDL',           'Stiff com halteres',       'hamstrings', '{glutes}',           'hinge',   '{dumbbell}',   'beginner',     TRUE,  '{lumbar_hernia}'),
(5, 'HIP_THRUST',       'Elevação pélvica',         'glutes',     '{hamstrings}',       'hinge',   '{barbell,bodyweight}', 'beginner', TRUE, '{}'),
(5, 'BB_BENCH_PRESS',   'Supino reto',              'chest',      '{triceps,front_delts}','push_h','{barbell}',    'intermediate', TRUE,  '{shoulder_injury}'),
(5, 'DB_BENCH_PRESS',   'Supino com halteres',      'chest',      '{triceps,front_delts}','push_h','{dumbbell}',   'beginner',     TRUE,  '{shoulder_injury}'),
(5, 'PUSH_UP',          'Flexão de braço',          'chest',      '{triceps,core}',     'push_h',  '{bodyweight}', 'beginner',     TRUE,  '{wrist_injury}'),
(5, 'OHP',              'Desenvolvimento militar',  'shoulders',  '{triceps}',          'push_v',  '{barbell,dumbbell}', 'intermediate', TRUE, '{shoulder_injury}'),
(5, 'LAT_PULLDOWN',     'Puxada na frente',         'lats',       '{biceps}',           'pull_v',  '{cable,machine}','beginner',    TRUE,  '{}'),
(5, 'PULL_UP',          'Barra fixa',               'lats',       '{biceps,core}',      'pull_v',  '{bodyweight}', 'advanced',     TRUE,  '{shoulder_injury}'),
(5, 'BB_ROW',           'Remada curvada',           'back',       '{lats,biceps}',      'pull_h',  '{barbell}',    'intermediate', TRUE,  '{lumbar_hernia}'),
(5, 'SEATED_ROW',       'Remada sentada',           'back',       '{lats,biceps}',      'pull_h',  '{cable,machine}','beginner',   TRUE,  '{}'),
(5, 'DB_CURL',          'Rosca direta halteres',    'biceps',     '{}',                 'pull_h',  '{dumbbell}',   'beginner',     FALSE, '{}'),
(5, 'TRICEPS_PUSHDOWN', 'Tríceps na polia',         'triceps',    '{}',                 'push_h',  '{cable}',      'beginner',     FALSE, '{}'),
(5, 'LATERAL_RAISE',    'Elevação lateral',         'shoulders',  '{}',                 'push_v',  '{dumbbell}',   'beginner',     FALSE, '{}'),
(5, 'LEG_CURL',         'Mesa flexora',             'hamstrings', '{}',                 'hinge',   '{machine}',    'beginner',     FALSE, '{}'),
(5, 'CALF_RAISE',       'Panturrilha em pé',        'calves',     '{}',                 'squat',   '{machine,bodyweight}', 'beginner', FALSE, '{}'),
(5, 'PLANK',            'Prancha',                  'core',       '{}',                 'core',    '{bodyweight}', 'beginner',     FALSE, '{}');

-- ---------------------------------------------------------------------------
-- Campos de anamnese — amostra priorizada (anamnese progressiva)
-- ---------------------------------------------------------------------------
INSERT INTO questionnaire_field (code, category, question_text, answer_type, options, validation, priority, triggers_flag) VALUES
('chest_pain_exertion', 'medical_history', 'Você sente dor no peito ao se esforçar?', 'boolean', NULL, NULL, 1, 'CHEST_PAIN'),
('pregnancy',           'medical_history', 'Está grávida ou amamentando?', 'boolean', NULL, NULL, 2, 'PREGNANCY'),
('t1_diabetes',         'medical_history', 'Tem diabetes tipo 1?', 'boolean', NULL, NULL, 3, 'T1_DIABETES'),
('has_hypertension',    'medical_history', 'Tem hipertensão diagnosticada?', 'boolean', NULL, NULL, 10, NULL),
('injuries',            'medical_history', 'Tem alguma lesão ativa? Quais?', 'multi_choice', '["knee_injury","lumbar_hernia","shoulder_injury","wrist_injury","none"]', NULL, 11, NULL),
('medications',         'medication',      'Usa algum medicamento contínuo?', 'text', NULL, NULL, 20, NULL),
('sleep_hours',         'habit',           'Quantas horas você dorme por noite, em média?', 'number', NULL, '{"min":0,"max":24}', 30, NULL),
('training_experience', 'context',         'Há quanto tempo treina com regularidade?', 'single_choice', '["never","lt_6m","6m_2y","2y_5y","gt_5y"]', NULL, 31, NULL),
('equipment_available', 'context',         'Que equipamentos você tem acesso?', 'multi_choice', '["barbell","dumbbell","machine","cable","kettlebell","band","bodyweight"]', NULL, 32, NULL),
('days_per_week',       'context',         'Quantos dias por semana pode treinar?', 'number', NULL, '{"min":1,"max":7}', 33, NULL),
('session_minutes',     'context',         'Quanto tempo por sessão?', 'number', NULL, '{"min":15,"max":180}', 34, NULL),
('food_allergies',      'context',         'Tem alergias ou intolerâncias alimentares?', 'multi_choice', '["lactose","gluten","nuts","seafood","egg","none"]', NULL, 35, NULL),
('diet_restrictions',   'context',         'Segue alguma restrição alimentar?', 'multi_choice', '["vegan","vegetarian","halal","kosher","none"]', NULL, 36, NULL),
('budget',              'context',         'Como descreveria seu orçamento para alimentação?', 'single_choice', '["low","medium","high"]', NULL, 40, NULL),
('stress_level',        'habit',           'Nível de estresse no dia a dia (1-10)?', 'number', NULL, '{"min":1,"max":10}', 41, NULL);

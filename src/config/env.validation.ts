import { z } from 'zod';

/**
 * Environment Variables Validation Schema
 * 
 * Dieses Schema definiert alle erwarteten und erforderlichen Umgebungsvariablen.
 * Die Validierung erfolgt beim Anwendungsstart und schlägt fehl, wenn 
 * erforderliche Variablen fehlen oder ungültige Werte haben.
 */
const envSchema = z.object({
  // Application Environment
  NODE_ENV: z.enum(['development', 'test', 'e2e', 'production'], {
    errorMap: () => ({ 
      message: 'NODE_ENV muss einer der folgenden Werte sein: development, test, e2e, production' 
    })
  }),

  // Server Configuration
  PORT: z.string()
    .regex(/^\d+$/, 'PORT muss eine Zahl sein')
    .transform(Number)
    .refine(port => port > 0 && port < 65536, {
      message: 'PORT muss zwischen 1 und 65535 liegen'
    }),

  // Database Configuration - Pflichtfelder
  DATABASE_TYPE: z.string()
    .min(1, 'DATABASE_TYPE darf nicht leer sein'),

  DATABASE_HOST: z.string()
    .min(1, 'DATABASE_HOST darf nicht leer sein'),

  DATABASE_PORT: z.string()
    .regex(/^\d+$/, 'DATABASE_PORT muss eine Zahl sein')
    .transform(Number)
    .refine(port => port > 0 && port < 65536, {
      message: 'DATABASE_PORT muss zwischen 1 und 65535 liegen'
    }),

  DATABASE_USERNAME: z.string()
    .min(1, 'DATABASE_USERNAME darf nicht leer sein'),

  DATABASE_PASSWORD: z.string()
    .min(1, 'DATABASE_PASSWORD darf nicht leer sein'),

  DATABASE_NAME: z.string()
    .min(1, 'DATABASE_NAME darf nicht leer sein'),

  // Database Connection Pool - Optional mit Defaults
  DATABASE_POOL_MAX: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),

  DATABASE_POOL_MIN: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),

  DATABASE_POOL_IDLE_TIMEOUT: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),

  DATABASE_POOL_ACQUIRE_TIMEOUT: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),

  // Database SSL - Optional
  DATABASE_SSL: z.string()
    .transform(val => val === 'true')
    .optional(),

  DATABASE_SSL_REJECT_UNAUTHORIZED: z.string()
    .transform(val => val === 'true')
    .optional(),

  // Database Advanced Settings - Optional
  DATABASE_CACHE_ENABLED: z.string()
    .transform(val => val === 'true')
    .optional(),

  DATABASE_CACHE_DURATION: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),
});

/**
 * Validierte Umgebungsvariablen Typ
 */
export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validiert die Umgebungsvariablen und gibt eine Fehlermeldung aus, falls Validierung fehlschlägt
 * 
 * @throws {Error} Wenn erforderliche Umgebungsvariablen fehlen oder ungültig sind
 * @returns {ValidatedEnv} Die validierten Umgebungsvariablen
 */
export function validateEnv(): ValidatedEnv {
  try {
    const validated = envSchema.parse(process.env);
    
    // Warnung ausgeben, wenn in Production gefährliche Einstellungen aktiv sind
    if (validated.NODE_ENV === 'production') {
      if (!validated.DATABASE_SSL) {
        console.warn('⚠️  WARNUNG: DATABASE_SSL ist in Production nicht aktiviert!');
      }
    }

    console.log('✅ Umgebungsvariablen erfolgreich validiert');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ FEHLER: Ungültige Umgebungsvariablen-Konfiguration!\n');
      
      error.errors.forEach(err => {
        const path = err.path.join('.');
        console.error(`  • ${path}: ${err.message}`);
      });

      console.error('\n💡 Tipp: Überprüfen Sie Ihre .env-Datei oder kopieren Sie .env.example zu .env\n');
      
      // Anwendungsstart verhindern
      process.exit(1);
    }
    
    throw error;
  }
}

/**
 * Helper-Funktion um validierte Env-Variablen zu erhalten
 * Wird beim ersten Aufruf validiert und gecacht
 */
let cachedEnv: ValidatedEnv;

export function getValidatedEnv(): ValidatedEnv {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

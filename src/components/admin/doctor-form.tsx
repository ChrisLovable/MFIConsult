import type { AdminDoctor } from "@/lib/admin-data";

interface DoctorFormProps {
  action: string;
  doctor?: AdminDoctor | null;
  submitLabel: string;
}

interface ServiceRule {
  name?: string;
  tariff_code?: string;
  rate?: number | null;
}

interface HourlyRule {
  rate?: number | null;
  minimum_minutes?: number | null;
  increment_minutes?: number | null;
  rounding?: string;
}

interface TimeRules {
  after_hours_start?: string | null;
  after_hours_end?: string | null;
  after_hours_markup_percent?: number | null;
  weekend_markup_percent?: number | null;
}

interface BillingProfile {
  billing_basis?: string;
  default_place_of_service?: string | null;
  required_fields?: string[];
  hourly?: HourlyRule;
  services?: ServiceRule[];
  time_rules?: TimeRules;
  transcription_keyterms?: string[];
}

const requiredFieldOptions = [
  ["patient_reference", "Patient reference"],
  ["consultation_date", "Consultation date"],
  ["consultation_time", "Consultation time"],
  ["consultation_type", "Consultation type"],
  ["duration_minutes", "Duration"],
  ["place_of_service", "Place of service"],
  ["diagnosis_summary", "Diagnosis"],
  ["icd10_codes", "ICD-10"],
  ["tariff_codes", "Tariff code"],
  ["medical_aid", "Medical aid"],
  ["authorisation_number", "Authorisation"],
] as const;

export function DoctorForm({
  action,
  doctor,
  submitLabel,
}: DoctorFormProps) {
  const profile =
    (doctor?.billing_profile ??
      {}) as BillingProfile;

  const services = profile.services ?? [];
  const hourly = profile.hourly ?? {};
  const timeRules = profile.time_rules ?? {};
  const requiredFields =
    profile.required_fields ?? [
      "patient_reference",
      "consultation_date",
      "consultation_time",
      "consultation_type",
      "duration_minutes",
    ];

  return (
    <form
      action={action}
      method="post"
      className="admin-form"
    >
      <section className="form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Identity
            </span>
            <h2>Doctor and practice</h2>
          </div>
          <span className="section-number">01</span>
        </div>

        <div className="form-grid form-grid-3">
          <label>
            <span>Doctor name *</span>
            <input
              name="full_name"
              required
              defaultValue={doctor?.full_name ?? ""}
              placeholder="Dr A Jacobs"
            />
          </label>

          <label>
            <span>Speciality</span>
            <input
              name="speciality"
              defaultValue={doctor?.speciality ?? ""}
              placeholder="General practitioner"
            />
          </label>

          <label>
            <span>Practice number</span>
            <input
              name="practice_number"
              defaultValue={
                doctor?.practice_number ?? ""
              }
              placeholder="0123456"
            />
          </label>

          <label>
            <span>Practice name</span>
            <input
              name="practice_name"
              defaultValue={
                doctor?.practice_name ?? ""
              }
              placeholder="Jacobs Medical Practice"
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              name="email"
              defaultValue={doctor?.email ?? ""}
              placeholder="doctor@example.co.za"
            />
          </label>

          <label>
            <span>Mobile number</span>
            <input
              name="mobile_number"
              defaultValue={
                doctor?.mobile_number ?? ""
              }
              placeholder="+27..."
            />
          </label>

          <label>
            <span>Telegram user ID</span>
            <input
              name="telegram_user_id"
              inputMode="numeric"
              defaultValue={
                doctor?.telegram_user_id === null ||
                doctor?.telegram_user_id === undefined
                  ? ""
                  : String(
                      doctor.telegram_user_id,
                    )
              }
              placeholder="Linked automatically"
            />
            <small>
              Normally linked through the doctor
              invitation.
            </small>
          </label>

          <label>
            <span>Accounting recipient</span>
            <input
              type="email"
              name="email_recipient"
              defaultValue={
                doctor?.email_recipient ?? ""
              }
              placeholder="Uses MFI default when blank"
            />
          </label>

          <label>
            <span>Default consultation location</span>
            <input
              name="default_place_of_service"
              defaultValue={
                profile.default_place_of_service ??
                ""
              }
              placeholder="Consulting rooms"
            />
          </label>
        </div>

        <label className="toggle-row">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={
              doctor?.is_active ?? true
            }
          />
          <span>
            <strong>Doctor active</strong>
            <small>
              Active doctors can submit billing
              voice notes.
            </small>
          </span>
        </label>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Billing model
            </span>
            <h2>How this doctor charges</h2>
          </div>
          <span className="section-number">02</span>
        </div>

        <div className="form-grid form-grid-4">
          <label>
            <span>Billing basis</span>
            <select
              name="billing_basis"
              defaultValue={
                profile.billing_basis ??
                "per_consultation"
              }
            >
              <option value="per_consultation">
                Per consultation
              </option>
              <option value="hourly">
                Hourly
              </option>
              <option value="procedure">
                Per procedure
              </option>
              <option value="mixed">
                Mixed billing
              </option>
            </select>
          </label>

          <label>
            <span>Hourly rate</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="hourly_rate"
              defaultValue={
                hourly.rate ?? ""
              }
              placeholder="2400"
            />
          </label>

          <label>
            <span>Minimum minutes</span>
            <input
              type="number"
              min="0"
              name="minimum_minutes"
              defaultValue={
                hourly.minimum_minutes ?? ""
              }
              placeholder="30"
            />
          </label>

          <label>
            <span>Billing increment</span>
            <input
              type="number"
              min="1"
              name="increment_minutes"
              defaultValue={
                hourly.increment_minutes ?? ""
              }
              placeholder="15"
            />
          </label>

          <label>
            <span>Rounding</span>
            <select
              name="rounding"
              defaultValue={
                hourly.rounding ?? "up"
              }
            >
              <option value="up">
                Round up
              </option>
              <option value="nearest">
                Nearest increment
              </option>
              <option value="exact">
                Exact duration
              </option>
            </select>
          </label>
        </div>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Services
            </span>
            <h2>Frequently billed services</h2>
          </div>
          <span className="section-number">03</span>
        </div>

        <div className="service-table">
          <div className="service-header">
            <span>Service</span>
            <span>Tariff code</span>
            <span>Rate (R)</span>
          </div>

          {[0, 1, 2].map((index) => (
            <div
              className="service-row"
              key={index}
            >
              <input
                name={`service_${index + 1}_name`}
                defaultValue={
                  services[index]?.name ?? ""
                }
                placeholder={
                  index === 0
                    ? "Initial consultation"
                    : index === 1
                      ? "Follow-up consultation"
                      : "Extended consultation"
                }
              />
              <input
                name={`service_${index + 1}_tariff`}
                defaultValue={
                  services[index]?.tariff_code ??
                  ""
                }
                placeholder="0191"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                name={`service_${index + 1}_rate`}
                defaultValue={
                  services[index]?.rate ?? ""
                }
                placeholder="850"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Time rules
            </span>
            <h2>After-hours and weekends</h2>
          </div>
          <span className="section-number">04</span>
        </div>

        <div className="form-grid form-grid-4">
          <label>
            <span>After-hours starts</span>
            <input
              type="time"
              name="after_hours_start"
              defaultValue={
                timeRules.after_hours_start ?? ""
              }
            />
          </label>

          <label>
            <span>After-hours ends</span>
            <input
              type="time"
              name="after_hours_end"
              defaultValue={
                timeRules.after_hours_end ?? ""
              }
            />
          </label>

          <label>
            <span>After-hours markup %</span>
            <input
              type="number"
              min="0"
              step="0.1"
              name="after_hours_markup_percent"
              defaultValue={
                timeRules.after_hours_markup_percent ??
                ""
              }
              placeholder="25"
            />
          </label>

          <label>
            <span>Weekend markup %</span>
            <input
              type="number"
              min="0"
              step="0.1"
              name="weekend_markup_percent"
              defaultValue={
                timeRules.weekend_markup_percent ??
                ""
              }
              placeholder="35"
            />
          </label>
        </div>
      </section>

      <section className="form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Data quality
            </span>
            <h2>Required billing information</h2>
          </div>
          <span className="section-number">05</span>
        </div>

        <div className="checkbox-grid">
          {requiredFieldOptions.map(
            ([value, label]) => (
              <label
                className="checkbox-card"
                key={value}
              >
                <input
                  type="checkbox"
                  name="required_fields"
                  value={value}
                  defaultChecked={requiredFields.includes(
                    value,
                  )}
                />
                <span>{label}</span>
              </label>
            ),
          )}
        </div>

        <label className="full-field">
          <span>
            Medical transcription keyterms
          </span>
          <textarea
            name="transcription_keyterms"
            rows={3}
            defaultValue={(
              profile.transcription_keyterms ??
              []
            ).join(", ")}
            placeholder="I10, Discovery, Mediclinic, hypertension, 0191"
          />
          <small>
            Comma-separated terms this doctor uses
            often.
          </small>
        </label>
      </section>

      <div className="sticky-submit">
        <div>
          <strong>{submitLabel}</strong>
          <span>
            Changes are versioned and audited.
          </span>
        </div>
        <button
          className="primary-button"
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

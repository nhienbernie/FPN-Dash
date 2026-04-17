const REQUIRED_PROFILE_FIELDS = [
  ["first_name", "first name"],
  ["last_name", "last name"],
  ["phone_number", "phone number"],
  ["email", "email"],
  ["zip", "ZIP code"],
];

const normalizeValue = (value) => String(value ?? "").trim();

const buildVolunteerProfilePayload = (user) => {
  const metadata = user?.user_metadata ?? {};

  return {
    uid: user?.id ?? "",
    first_name: normalizeValue(metadata.first_name),
    last_name: normalizeValue(metadata.last_name),
    phone_number: normalizeValue(metadata.phone_number),
    email: normalizeValue(user?.email),
    zip: normalizeValue(metadata.zip),
  };
};

export async function ensureVolunteerProfile({ supabase, user }) {
  if (!supabase || !user?.id) {
    return {
      status: "error",
      message: "No signed-in volunteer account was found.",
    };
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("volunteers")
    .select("uid")
    .eq("uid", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return {
      status: "error",
      message:
        existingProfileError.message ||
        "Unable to check your volunteer profile right now.",
    };
  }

  if (existingProfile) {
    return { status: "exists" };
  }

  const payload = buildVolunteerProfilePayload(user);
  const missingFields = REQUIRED_PROFILE_FIELDS.filter(
    ([field]) => !payload[field],
  ).map(([, label]) => label);

  if (missingFields.length > 0) {
    return {
      status: "incomplete",
      message: `Your account is missing ${missingFields.join(
        ", ",
      )}, so we couldn't restore the volunteer profile automatically.`,
    };
  }

  const { error: insertError } = await supabase.from("volunteers").insert(payload);

  if (insertError) {
    return {
      status: "error",
      message:
        insertError.message ||
        "Unable to restore your volunteer profile right now.",
    };
  }

  return { status: "created" };
}

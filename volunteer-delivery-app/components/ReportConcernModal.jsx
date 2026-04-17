import { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from "react-native";
import AppButton from "../components/AppButton";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const REASONS = ["no_show", "harassment", "unsafe", "other"];
const REASON_LABELS = {
  no_show: "No Show",
  harassment: "Harassment",
  unsafe: "Unsafe Situation",
  other: "Other",
};

export default function ReportConcernModal({ visible, onClose, orderId, reportedId }) {
  const [selectedReason, setSelectedReason] = useState(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);

  const handleClose = () => {
    setSelectedReason(null);
    setReportDescription("");
    setReportError("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      setReportError("Please select a reason.");
      return;
    }

    setReportSubmitting(true);
    setReportError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("reports").insert({
        order_id: orderId,
        reporter_id: user.id,
        reporter_role: "volunteer",
        reported_id: reportedId,
        reported_role: "requester",
        reason: selectedReason,
        description: reportDescription.trim() || null,
        status: "pending",
      });

      if (error) {
        console.error("Error submitting report:", error);
        setReportError("Something went wrong. Please try again.");
      } else {
        setSelectedReason(null);
        setReportDescription("");
        onClose();
        setSuccessVisible(true);
      }
    } catch (e) {
      console.error("Error submitting report:", e);
      setReportError("Something went wrong. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <>
      {/* Report Form Modal */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report a Concern</Text>
            <Text style={styles.modalSubtitle}>Select a reason</Text>

            {REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reasonOption,
                  selectedReason === reason && styles.reasonOptionSelected,
                ]}
                onPress={() => setSelectedReason(reason)}
              >
                <Text
                  style={[
                    styles.reasonText,
                    selectedReason === reason && styles.reasonTextSelected,
                  ]}
                >
                  {REASON_LABELS[reason]}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.modalSubtitle, { marginTop: theme.spacing.md }]}>
              Additional details (optional)
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Describe what happened..."
              placeholderTextColor={theme.colors.mutedText}
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              numberOfLines={4}
            />

            {reportError ? (
              <Text style={styles.errorText}>{reportError}</Text>
            ) : null}

            <View style={[styles.modalButtons, { marginTop: theme.spacing.md }]}>
              <AppButton
                title={reportSubmitting ? "Submitting..." : "Submit"}
                onPress={handleSubmit}
                disabled={reportSubmitting}
                style={{ marginRight: theme.spacing.sm }}
              />
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={handleClose}
                disabled={reportSubmitting}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.modalTitle}>Report Submitted</Text>
            <Text style={styles.modalText}>
              Your concern has been noted. An admin will review your report and take appropriate action.
            </Text>
            <AppButton
              title="OK"
              onPress={() => setSuccessVisible(false)}
              style={{ marginTop: theme.spacing.sm }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    borderRadius: 10,
    alignItems: "center",
    width: "90%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.mutedText,
    marginBottom: theme.spacing.sm,
    alignSelf: "flex-start",
  },
  modalText: {
    fontSize: 18,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
  },
  reasonOption: {
    width: "100%",
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.mutedText,
    borderRadius: 8,
    marginBottom: theme.spacing.sm,
    alignItems: "center",
  },
  reasonOptionSelected: {
    borderColor: "#398288",
    backgroundColor: "#39828820",
  },
  reasonText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  reasonTextSelected: {
    color: "#398288",
    fontWeight: "600",
  },
  textInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.mutedText,
    borderRadius: 8,
    padding: theme.spacing.sm,
    fontSize: 15,
    color: theme.colors.text,
    textAlignVertical: "top",
    minHeight: 80,
  },
  errorText: {
    fontSize: 14,
    color: "#cc3300",
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  successIcon: {
    fontSize: 40,
    color: "#398288",
    marginBottom: theme.spacing.sm,
  },
});

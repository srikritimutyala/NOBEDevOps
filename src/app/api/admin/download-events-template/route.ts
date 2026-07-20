import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import ExcelJS from "exceljs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Verify Admin privileges
    const { data: userProfile, error: profileError } = await supabase
      .from("People")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== "ADMIN") {
      return new Response("Forbidden", { status: 403 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Events Template");

    // Define columns and widths
    worksheet.columns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Points", key: "points", width: 10 },
      { header: "Date", key: "date", width: 15 },
      { header: "Start Time", key: "start_time", width: 15 },
      { header: "End Time", key: "end_time", width: 15 },
      { header: "Event Type", key: "event_type", width: 25 },
      { header: "Mandatory", key: "is_mandatory", width: 12 },
      { header: "Start Offset", key: "start_offset", width: 15 },
      { header: "End Offset", key: "end_offset", width: 15 },
      { header: "Location", key: "location", width: 20 },
      { header: "Dress Code", key: "dresscode", width: 20 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "E58A27" }, // NOBE Accent orange
    };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };
    headerRow.height = 28;

    // Add sample row
    worksheet.addRow({
      name: "Example General Meeting",
      points: 5,
      date: "2026-07-06",
      start_time: "18:00",
      end_time: "19:00",
      event_type: "GENERAL_MEETING",
      is_mandatory: "Yes",
      start_offset: -15,
      end_offset: 30,
      location: "CIF 3025",
      dresscode: "Business Casual",
    });

    // Add validation rules for 200 rows
    for (let i = 2; i <= 200; i++) {
      // Points validation (whole number >= 0)
      worksheet.getCell(`B${i}`).dataValidation = {
        type: "whole",
        operator: "greaterThanOrEqual",
        formulae: [0],
        showErrorMessage: true,
        errorTitle: "Invalid Points",
        error: "Points must be a non-negative number.",
      };

      // Date validation (date must be after 2020-01-01)
      worksheet.getCell(`C${i}`).dataValidation = {
        type: "date",
        operator: "greaterThan",
        allowBlank: true,
        formulae: [new Date(2020, 0, 1)],
        showErrorMessage: true,
        errorTitle: "Invalid Date",
        error: "Please enter a valid date (double-click to open calendar).",
      };

      // Event Type Validation (dropdown list)
      worksheet.getCell(`F${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"PROFESSIONAL,SERVICE,SOCIAL,GENERAL_MEETING,NEW_MEMBER_WORKSHOP,PROJECT_MEETING,OTHER_MANDATORY"'],
        showErrorMessage: true,
        errorTitle: "Invalid Event Type",
        error: "Please choose a valid event type from the dropdown.",
      };

      // Mandatory validation (Yes/No list)
      worksheet.getCell(`G${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Yes,No"'],
        showErrorMessage: true,
        errorTitle: "Invalid Mandatory Option",
        error: "Please select 'Yes' or 'No'.",
      };

      // Start Offset validation (allow whole numbers)
      worksheet.getCell(`H${i}`).dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [-1440, 1440],
        showErrorMessage: true,
        errorTitle: "Invalid Start Offset",
        error: "Must be a minute offset between -1440 and 1440.",
      };

      // End Offset validation (allow whole numbers)
      worksheet.getCell(`I${i}`).dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [-1440, 1440],
        showErrorMessage: true,
        errorTitle: "Invalid End Offset",
        error: "Must be a minute offset between -1440 and 1440.",
      };

      // Dress Code validation (dropdown list)
      worksheet.getCell(`K${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Casual,Business Casual,Business Professional,Formal"'],
        showErrorMessage: true,
        errorTitle: "Invalid Dress Code",
        error: "Please choose a valid dress code from the list.",
      };
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="nobe_bulk_events_template.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("Failed to generate Excel template:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

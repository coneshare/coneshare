import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DestinationForm } from "../../../components/automations/DestinationForm";

describe("DestinationForm", () => {
  it("renders default inputs for name, type select, method select, and endpoint url", () => {
    render(<DestinationForm onSubmit={() => {}} />);
    
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Method/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Endpoint URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Signing Secret/i)).toBeInTheDocument();
  });

  it("submits the form with user input values", () => {
    const handleSubmit = vi.fn();
    render(<DestinationForm onSubmit={handleSubmit} submitLabel="Save" />);
    
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Sales Webhook" } });
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: "webhook" } });
    fireEvent.change(screen.getByLabelText(/Method/i), { target: { value: "POST" } });
    fireEvent.change(screen.getByLabelText(/Endpoint URL/i), { target: { value: "https://example.com/callback" } });
    fireEvent.change(screen.getByLabelText(/Signing Secret/i), { target: { value: "my-secret" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    
    expect(handleSubmit).toHaveBeenCalledWith({
      name: "Sales Webhook",
      destination_type: "webhook",
      endpoint_url: "https://example.com/callback",
      http_method: "POST",
      signing_secret: "my-secret",
      headers: {},
      is_active: true
    });
  });
});

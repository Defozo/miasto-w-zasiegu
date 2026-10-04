import unittest
from extractor import extract_dimensions, numeric_expression


class DimensionExtractionTests(unittest.TestCase):
    def test_decimal_comma_range_and_different_units(self):
        parsed = numeric_expression("50,5 Zentimeter - 680 Millimeter")
        self.assertEqual((parsed["min_mm"], parsed["max_mm"]), (505, 680))

    def test_seat_formula_is_preserved_and_not_evaluated_as_overall_width(self):
        parsed = numeric_expression("Sitzbreite + 2,2 cm")
        self.assertEqual(parsed["kind"], "formula")
        self.assertEqual(parsed["formula"]["offset_mm"], 22)
        self.assertNotIn("value_mm", parsed)

    def test_options_and_decimal_commas(self):
        parsed = numeric_expression("38, 40,5, 43, 48 cm")
        self.assertEqual(parsed["values_mm"], [380, 405, 430, 480])

    def test_adjustment_step_is_not_a_dimension(self):
        parsed = numeric_expression("42 - 57 cm (in 50 mm-Stufen)")
        self.assertEqual((parsed["min_mm"], parsed["max_mm"]), (420, 570))
        self.assertIn("50 mm", parsed["qualifier"])

    def test_unlabelled_width_cannot_become_overall_width(self):
        parsed = extract_dimensions("Sitzbreite: 45 cm\nBreite: 600 mm\nLänge: 855 mm")
        self.assertEqual(parsed["overall_width"], [])
        self.assertEqual(parsed["overall_length"], [])
        self.assertEqual(parsed["length_unspecified"][0]["value_mm"], 855)

    def test_radius_is_not_diameter(self):
        parsed = extract_dimensions("Wenderadius: 85 cm\nWendekreis: 120 cm")
        self.assertEqual(parsed["turning_radius"][0]["value_mm"], 850)
        self.assertEqual(parsed["turning_diameter"], [])
        self.assertEqual(parsed["turning_measure_unspecified"][0]["value_mm"], 1200)

    def test_non_numeric_and_reversed_range_are_not_accepted(self):
        self.assertEqual(numeric_expression("keine Änderungen notwendig")["kind"], "unparsed")
        self.assertEqual(numeric_expression("79 cm bis 65 cm")["kind"], "unparsed")


if __name__ == "__main__":
    unittest.main()

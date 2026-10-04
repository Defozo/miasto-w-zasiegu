package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class FavoritesTest {
    private val point = ChosenLocation("a", "Długa 12", Point(19.9384226, 50.0670497), "address", "address", "")
    private fun favorite(label: String = "Dom", at: ChosenLocation = point) = Favorite(label, label, at, "first-date", "first-date")
    @Test fun repeatedSaveKeepsOriginalIdentityAndDate() {
        val old = favorite()
        val renamedPoint = point.copy(label = "Inny opis tego samego punktu")
        val result = FavoriteRules.add(listOf(old), favorite("  DOM  ", renamedPoint).copy(id = "new-id", createdAt = "new-date"))
        assertEquals(listOf(old), result)
    }
    @Test fun homeAndWorkAtTheSamePointAreSeparateAndChangedPointIsNotOverwritten() {
        val first = FavoriteRules.add(listOf(favorite()), favorite("Praca"))
        val moved = favorite(at = point.copy(point = Point(19.95, 50.07)))
        assertEquals(3, FavoriteRules.add(first, moved).size)
    }
    @Test fun duplicateStillWorksAtLimitButNewPlaceDoesNot() {
        val full = (1..30).map { favorite("Miejsce $it") }
        assertEquals(full, FavoriteRules.add(full, favorite("miejsce 1")))
        assertThrows(IllegalArgumentException::class.java) { FavoriteRules.add(full, favorite("Nowe")) }
    }
    @Test fun blankControlAndTooLongLabelsAreRejectedAndUnicodeNamesAreEquivalent() {
        assertFalse(FavoriteRules.validLabel("  ")); assertFalse(FavoriteRules.validLabel("Dom\n"))
        assertFalse(FavoriteRules.validLabel("x".repeat(81)))
        assertTrue(FavoriteRules.same(favorite("Café"), "Cafe\u0301", point))
    }
    @Test fun selectingFavoriteConfirmsRouteEntryWithoutReplacingItsActualAddress() {
        val selected = LocationEntry(text = "niezatwierdzony tekst").choose(favorite().point)
        assertTrue(selected.confirmed); assertEquals("Długa 12", selected.text)
        assertFalse(selected.edit("Długa 120").confirmed)
    }
    @Test fun newProfileMatchesWebSurfaceDefault() { assertFalse(Needs().unpaved) }
}

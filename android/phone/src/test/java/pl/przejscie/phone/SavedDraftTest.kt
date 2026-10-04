package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class SavedDraftTest {
    private val point = ChosenLocation("address-42", "Długa 12 · punkt adresowy", Point(19.942, 50.065),
        "address", "address", "Źródło", "https://example.test/42", "address", "Wejście niezweryfikowane.")

    @Test fun confirmedAddressRetainsExactPointAndCaveatsAfterRestoration() {
        val entry = LocationEntry(key = "via-3").choose(point)
        val restored = restoreLocation(entry.savedFields())!!
        assertEquals(entry, restored)
        assertTrue(restored.confirmed)
    }

    @Test fun TypedAddressDoesNotBecomeConfirmedOnRestoration() {
        val edited = LocationEntry().choose(point).edit(point.label)
        val restored = restoreLocation(edited.savedFields())!!
        assertEquals(edited.text, restored.text)
        assertNull(restored.chosen)
        assertFalse(canPlan(restored, LocationEntry().choose(point), emptyList()))
    }

    @Test fun fiveStopsRetainOrderAndIdentity() {
        val stops = List(5) { index -> LocationEntry("via-$index").choose(point.copy(id = "p-$index", label = "Adres $index")) }
        assertEquals(stops, stops.map { restoreLocation(it.savedFields()) })
    }

    @Test fun malformedOrNonFiniteCoordinatesCannotRestoreConfirmedPoint() {
        assertNull(restoreLocation(listOf("partial")))
        val fields = LocationEntry().choose(point).savedFields().toMutableList()
        fields[4] = "NaN"; assertNull(restoreLocation(fields))
        fields[4] = "181"; assertNull(restoreLocation(fields))
        fields[4] = "19.942"; fields[5] = "91"; assertNull(restoreLocation(fields))
        fields[5] = "50.065"; fields[1] = "Zmieniony tekst"
        assertFalse(restoreLocation(fields)!!.confirmed)
    }

    @Test fun savedAddressesCannotMoveBetweenAccountAndGuestOwners() {
        val entry = LocationEntry().choose(point)
        val fields = listOf("account-a") + entry.savedFields()
        assertEquals(entry, restoreOwnedLocation("account-a", fields))
        assertNull(restoreOwnedLocation("account-b", fields))
        assertNull(restoreOwnedLocation(null, fields))
        assertNull(restoreOwnedLocation("account-a", listOf("") + entry.savedFields()))
    }

    @Test fun restoredIntermediateStopsRequireSameOwnerAndAtMostFivePoints() {
        val entry = LocationEntry().choose(point).savedFields()
        val rows = listOf(listOf("account-a"), entry)
        assertEquals(1, restoreOwnedStops("account-a", rows)!!.size)
        assertNull(restoreOwnedStops("account-b", rows))
        assertNull(restoreOwnedStops(null, rows))
        assertNull(restoreOwnedStops("account-a", listOf(listOf("account-a")) + List(6) { entry }))
        assertEquals(emptyList<LocationEntry>(), restoreOwnedStops(null, listOf(listOf(""))))
    }
}

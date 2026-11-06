// Despeja en el iPhone: contactos repetidos (mismo nombre, o el mismo teléfono o correo) y contactos incompletos (sin teléfono ni
// correo). Juntar deja uno con todos los teléfonos, correos y notas; los demás se borran. Nada sale del iPhone.
import Contacts
import Foundation

@MainActor
final class Contactos {
    static let shared = Contactos()
    private let tienda = CNContactStore()
    private var repetidos: [[String]] = []     // grupos de identificadores; el primero es el que se queda
    private var incompletos: [String] = []

    nonisolated(unsafe) private static let claves: [CNKeyDescriptor] = [
        CNContactGivenNameKey, CNContactFamilyNameKey, CNContactOrganizationNameKey, CNContactPhoneNumbersKey,
        CNContactEmailAddressesKey, CNContactImageDataAvailableKey].map { $0 as CNKeyDescriptor }
        + [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]

    func analizar() async -> [String: Any] {
        guard (try? await tienda.requestAccess(for: .contacts)) == true else {
            return ["ok": false, "codigo": "sin_permiso", "error": Idioma.t("Para revisar tus contactos necesito permiso.")]
        }
        let tienda = self.tienda
        let (rep, inc, nombres, total) = await Task.detached(priority: .userInitiated) { () -> ([[String]], [String], [String: String], Int) in
            var todos: [CNContact] = []
            let pedido = CNContactFetchRequest(keysToFetch: Contactos.claves)
            try? tienda.enumerateContacts(with: pedido) { c, _ in todos.append(c) }
            var nombres: [String: String] = [:]
            for c in todos { nombres[c.identifier] = Contactos.nombre(c) }
            // Unir por nombre normalizado, teléfono (últimos 8 dígitos) y correo
            var padre: [String: String] = [:]
            func raiz(_ x: String) -> String { var r = x; while let p = padre[r], p != r { r = p }; return r }
            func unir(_ a: String, _ b: String) { let ra = raiz(a), rb = raiz(b); if ra != rb { padre[rb] = ra } }
            for c in todos { padre[c.identifier] = c.identifier }
            var por: [String: String] = [:]
            for c in todos {
                var llaves: [String] = []
                let n = Contactos.normalizar(nombres[c.identifier] ?? "")
                if n.count >= 3 { llaves.append("n:" + n) }
                for t in c.phoneNumbers { let d = t.value.stringValue.filter(\.isNumber); if d.count >= 8 { llaves.append("t:" + String(d.suffix(8))) } }
                for e in c.emailAddresses { llaves.append("e:" + (e.value as String).lowercased()) }
                for k in llaves { if let otro = por[k] { unir(otro, c.identifier) } else { por[k] = c.identifier } }
            }
            var grupos: [String: [CNContact]] = [:]
            for c in todos { grupos[raiz(c.identifier), default: []].append(c) }
            // El que se queda: el más completo
            let rep = grupos.values.filter { $0.count > 1 }.map { g in
                g.sorted { Contactos.datos($0) > Contactos.datos($1) }.map(\.identifier)
            }
            let inc = todos.filter { $0.phoneNumbers.isEmpty && $0.emailAddresses.isEmpty }.map(\.identifier)
            return (rep, inc, nombres, todos.count)
        }.value
        repetidos = rep
        incompletos = inc
        return ["ok": true, "total": total,
                "repetidos": rep.map { g in ["ids": g, "nombres": g.map { nombres[$0] ?? "" }] },
                "incompletos": inc.map { ["id": $0, "nombre": nombres[$0] ?? ""] }]
    }

    nonisolated static func nombre(_ c: CNContact) -> String {
        let n = CNContactFormatter.string(from: c, style: .fullName) ?? ""
        return n.isEmpty ? c.organizationName : n
    }

    nonisolated static func normalizar(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).filter { $0.isLetter }
    }

    nonisolated static func datos(_ c: CNContact) -> Int {
        c.phoneNumbers.count * 3 + c.emailAddresses.count * 2 + (c.imageDataAvailable ? 2 : 0) + (c.organizationName.isEmpty ? 0 : 1)
    }

    /// Junta cada grupo de repetidos en el primero (el más completo): suma teléfonos y correos que falten y borra los demás.
    func juntar() async -> [String: Any] {
        let grupos = repetidos
        guard !grupos.isEmpty else { return ["ok": true, "juntados": 0] }
        let tienda = self.tienda
        let n = await Task.detached(priority: .userInitiated) { () -> Int in
            var juntados = 0
            let claves = Contactos.claves
            for g in grupos {
                guard let todos = try? tienda.unifiedContacts(matching: CNContact.predicateForContacts(withIdentifiers: g), keysToFetch: claves),
                      let principal = todos.first(where: { $0.identifier == g[0] })?.mutableCopy() as? CNMutableContact else { continue }
                let otros = todos.filter { $0.identifier != g[0] }
                var telefonos = Set(principal.phoneNumbers.map { String($0.value.stringValue.filter(\.isNumber).suffix(8)) })
                var correos = Set(principal.emailAddresses.map { ($0.value as String).lowercased() })
                for o in otros {
                    for t in o.phoneNumbers where telefonos.insert(String(t.value.stringValue.filter(\.isNumber).suffix(8))).inserted {
                        principal.phoneNumbers.append(CNLabeledValue(label: t.label, value: t.value))
                    }
                    for e in o.emailAddresses where correos.insert((e.value as String).lowercased()).inserted {
                        principal.emailAddresses.append(CNLabeledValue(label: e.label, value: e.value))
                    }
                }
                let guardar = CNSaveRequest()
                guardar.update(principal)
                for o in otros { if let m = o.mutableCopy() as? CNMutableContact { guardar.delete(m) } }
                if (try? tienda.execute(guardar)) != nil { juntados += 1 }
            }
            return juntados
        }.value
        repetidos = []
        return ["ok": true, "juntados": n]
    }

    func borrarIncompletos(_ ids: [String]) async -> [String: Any] {
        let validos = ids.filter { incompletos.contains($0) }
        guard !validos.isEmpty else { return ["ok": true, "borrados": 0] }
        let tienda = self.tienda
        let n = await Task.detached(priority: .userInitiated) { () -> Int in
            guard let lista = try? tienda.unifiedContacts(matching: CNContact.predicateForContacts(withIdentifiers: validos),
                                                         keysToFetch: [CNContactIdentifierKey as CNKeyDescriptor]) else { return 0 }
            let r = CNSaveRequest()
            for c in lista { if let m = c.mutableCopy() as? CNMutableContact { r.delete(m) } }
            return (try? tienda.execute(r)) != nil ? lista.count : 0
        }.value
        incompletos.removeAll { validos.contains($0) }
        return ["ok": true, "borrados": n]
    }
}

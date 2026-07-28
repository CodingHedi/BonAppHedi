package fr.bonapphedi.api;

import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserRegistry;
import fr.bonapphedi.social.SocialDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Choosing the name an account is shown under.
 *
 * <p>Exists because that is two writes and they have to be one change: the choice
 * goes on {@code app_user.nickname}, and the copies of the old name already sitting
 * on {@code comment.display_name} have to be rewritten. Half of that is worse than
 * neither — the account would claim a chosen name while every comment it had
 * already posted still carried the real one, which is the exact thing somebody
 * setting a pseudonym is trying to avoid.
 *
 * <p>In {@code api} rather than in {@code auth} because it reaches into both, and
 * {@code social} already depends on {@code auth}. A class here orchestrating the
 * two keeps that arrow pointing one way.
 */
@Service
public class DisplayNameService {

    private final AppUserRegistry users;
    private final SocialDao social;

    public DisplayNameService(AppUserRegistry users, SocialDao social) {
        this.users = users;
        this.social = social;
    }

    /**
     * Stores the choice and rewrites the bylines already published.
     *
     * @param chosen the normalised name, or {@code null} to go back to the
     *     provider's — in which case the bylines are rewritten to that, so clearing
     *     a pseudonym is as complete as setting one.
     * @return the name the account is shown as afterwards.
     */
    @Transactional
    public String choose(AppUser user, String chosen) {
        users.chooseNickname(user.id(), chosen);

        // Read back rather than assumed, so this returns what the column holds and
        // the byline rewrite below cannot disagree with the session response.
        String shown = users.shownNameOf(user);
        social.renameAuthor(user.id(), shown);

        return shown;
    }
}
